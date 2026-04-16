/**
 * OCI ARM Instance Auto-Creation Worker
 * Cloudflare Worker version with Cron Trigger support
 */

interface Env {
  // OCI Configuration
  OCI_USER: string;
  OCI_FINGERPRINT: string;
  OCI_TENANCY: string;
  OCI_REGION: string;
  OCI_PRIVATE_KEY: string; // PEM format private key as string
  
  // Instance Configuration
  OCPUS: string;
  INSTANCE_DISPLAY_NAME: string;
  COMPARTMENT_ID: string;
  AVAILABILITY_DOMAIN: string;
  IMAGE_ID: string;
  SUBNET_ID: string;
  SSH_PUBLIC_KEY: string;
  
  // Telegram Configuration
  TELEGRAM_BOT_API: string;
  TELEGRAM_CHAT_ID: string;
  
  // Optional
  WAIT_S_FOR_RETRY?: string;
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    try {
      await createOCIInstance(env);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : String(error));
    }
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'GET') {
      try {
        const result = await createOCIInstance(env);
        return new Response(JSON.stringify({ success: true, result }, null, 2), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({ 
          success: false,
          error: error instanceof Error ? error.message : String(error)
        }, null, 2), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    
    return new Response('OCI Auto-Creation Worker is running.', { status: 200 });
  }
};

async function createOCIInstance(env: Env): Promise<any> {
  const ocpus = parseInt(env.OCPUS || '4');
  const memoryInGbs = ocpus * 6;
  
  // Check existing instances
  const existingInstances = await listInstances(env);
  
  let totalOcpus = 0;
  let totalMemory = 0;
  const instanceNames: string[] = [];
  
  for (const instance of existingInstances) {
    instanceNames.push(instance.displayName);
    
    if (instance.shape === 'VM.Standard.A1.Flex' && 
        !['TERMINATING', 'TERMINATED'].includes(instance.lifecycleState)) {
      totalOcpus += instance.shapeConfig?.ocpus || 0;
      totalMemory += instance.shapeConfig?.memoryInGBs || 0;
    }
  }
  
  // Pre-check resource limits
  if (totalOcpus + ocpus > 4 || totalMemory + memoryInGbs > 24) {
    throw new Error(`Resource limit exceeded: ${totalOcpus}/${4} OCPUs, ${totalMemory}/${24} GB`);
  }
  
  // Check for duplicate display name
  if (instanceNames.includes(env.INSTANCE_DISPLAY_NAME)) {
    throw new Error(`Duplicate instance name: ${env.INSTANCE_DISPLAY_NAME}`);
  }
  
  // Launch instance
  try {
    const result = await launchInstance(env, ocpus, memoryInGbs);
    const msg = `✅ 成功创建实例！\n名称: ${env.INSTANCE_DISPLAY_NAME}\n配置: ${ocpus} OCPUs / ${memoryInGbs} GB RAM\n请编辑 VNIC 以获取公网 IP。`;
    console.log(msg);
    await sendTelegramMessage(env, msg);
    return { success: true, data: result };
  } catch (error: any) {
    if (error.status === 500 || error.code === 'InternalError') {
      // Out of capacity - silent retry
      console.log('Out of host capacity, will retry on next cron trigger');
      return { success: false, reason: 'OutOfCapacity' };
    }
    throw error;
  }
}

async function listInstances(env: Env): Promise<any[]> {
  const endpoint = `https://iaas.${env.OCI_REGION}.oraclecloud.com/20160918/instances/`;
  const url = `${endpoint}?compartmentId=${encodeURIComponent(env.COMPARTMENT_ID)}`;
  
  const response = await makeOCIRequest(env, 'GET', url);
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to list instances: ${response.status} ${errorText}`);
  }
  
  return await response.json();
}

async function launchInstance(env: Env, ocpus: number, memoryInGbs: number): Promise<any> {
  const endpoint = `https://iaas.${env.OCI_REGION}.oraclecloud.com/20160918/instances/`;
  
  const instanceDetails = {
    availabilityDomain: env.AVAILABILITY_DOMAIN,
    compartmentId: env.COMPARTMENT_ID,
    shape: 'VM.Standard.A1.Flex',
    displayName: env.INSTANCE_DISPLAY_NAME,
    sourceDetails: {
      sourceType: 'image',
      imageId: env.IMAGE_ID
    },
    createVnicDetails: {
      assignPublicIp: false,
      subnetId: env.SUBNET_ID,
      assignPrivateDnsRecord: true
    },
    metadata: {
      ssh_authorized_keys: env.SSH_PUBLIC_KEY
    },
    agentConfig: {
      isMonitoringDisabled: false,
      isManagementDisabled: false,
      pluginsConfig: [
        { name: 'Vulnerability Scanning', desiredState: 'DISABLED' },
        { name: 'Compute Instance Monitoring', desiredState: 'ENABLED' },
        { name: 'Bastion', desiredState: 'DISABLED' }
      ]
    },
    definedTags: {},
    freeformTags: {},
    instanceOptions: {
      areLegacyImdsEndpointsDisabled: false
    },
    availabilityConfig: {
      recoveryAction: 'RESTORE_INSTANCE'
    },
    shapeConfig: {
      ocpus: ocpus,
      memoryInGBs: memoryInGbs
    }
  };
  
  const response = await makeOCIRequest(env, 'POST', endpoint, instanceDetails);
  
  if (!response.ok) {
    const errorText = await response.text();
    let errorData;
    try {
      errorData = JSON.parse(errorText);
    } catch {
      errorData = { message: errorText };
    }
    
    const error: any = new Error(errorData.message || errorText);
    error.status = response.status;
    error.code = errorData.code;
    throw error;
  }
  
  return await response.json();
}

async function makeOCIRequest(
  env: Env, 
  method: string, 
  url: string, 
  body?: any
): Promise<Response> {
  const urlObj = new URL(url);
  const host = urlObj.host;
  const target = urlObj.pathname + urlObj.search;
  const date = new Date().toUTCString();
  
  // Prepare body
  const bodyString = body ? JSON.stringify(body) : '';
  const bodyBytes = new TextEncoder().encode(bodyString);
  
  // Build headers list for signing
  const headersToSign = ['date', '(request-target)', 'host'];
  
  // Build signing string components
  const signingComponents: string[] = [
    `date: ${date}`,
    `(request-target): ${method.toLowerCase()} ${target}`,
    `host: ${host}`
  ];
  
  // Add content headers for POST/PUT requests
  if (body && bodyString) {
    // Calculate SHA256 hash of body
    const bodyHash = await crypto.subtle.digest('SHA-256', bodyBytes);
    const bodyHashBase64 = btoa(String.fromCharCode(...new Uint8Array(bodyHash)));
    
    headersToSign.push('content-length', 'content-type', 'x-content-sha256');
    signingComponents.push(`content-length: ${bodyBytes.length}`);
    signingComponents.push(`content-type: application/json`);
    signingComponents.push(`x-content-sha256: ${bodyHashBase64}`);
  }
  
  const signingString = signingComponents.join('\n');
  
  // Sign the request
  const signature = await signRequest(env.OCI_PRIVATE_KEY, signingString);
  
  // Build authorization header
  const keyId = `${env.OCI_TENANCY}/${env.OCI_USER}/${env.OCI_FINGERPRINT}`;
  const headersParam = headersToSign.join(' ');
  const authHeader = `Signature version="1",keyId="${keyId}",algorithm="rsa-sha256",headers="${headersParam}",signature="${signature}"`;
  
  const headers: Record<string, string> = {
    'date': date,
    'host': host,
    'authorization': authHeader
  };
  
  if (body && bodyString) {
    // Calculate SHA256 hash of body for x-content-sha256 header
    const bodyHash = await crypto.subtle.digest('SHA-256', bodyBytes);
    const bodyHashBase64 = btoa(String.fromCharCode(...new Uint8Array(bodyHash)));
    
    headers['content-type'] = 'application/json';
    headers['content-length'] = bodyBytes.length.toString();
    headers['x-content-sha256'] = bodyHashBase64;
  }
  
  return fetch(url, {
    method,
    headers,
    body: bodyString || undefined
  });
}

async function signRequest(privateKeyPem: string, signingString: string): Promise<string> {
  console.log('\n>>> Starting signature generation');
  
  try {
    // Clean the private key
    let cleanedKey = privateKeyPem.trim();
    
    console.log(`Private key raw length: ${privateKeyPem.length} chars`);
    console.log(`Private key starts with: ${privateKeyPem.substring(0, 30)}...`);
    
    // Check if it's already clean base64 (no headers)
    const hasHeaders = cleanedKey.includes('-----BEGIN');
    console.log(`Has PEM headers: ${hasHeaders}`);
    
    if (hasHeaders) {
      // Detect key type
      if (cleanedKey.includes('-----BEGIN RSA PRIVATE KEY-----')) {
        throw new Error('❌ Private key is in RSA format! Must be PKCS#8 format (BEGIN PRIVATE KEY). Use: wrangler secret delete OCI_PRIVATE_KEY, then convert key and re-upload.');
      }
      
      if (cleanedKey.includes('ENCRYPTED')) {
        throw new Error('❌ Private key is encrypted! Must be unencrypted. Decrypt it first.');
      }
      
      // Remove PEM headers, footers, and all whitespace
      cleanedKey = cleanedKey
        .replace(/-----BEGIN[^-]+-----/g, '')
        .replace(/-----END[^-]+-----/g, '')
        .replace(/\r/g, '')
        .replace(/\n/g, '')
        .replace(/\s/g, '')
        .trim();
    } else {
      // Already clean, just remove whitespace
      cleanedKey = cleanedKey.replace(/\s/g, '');
    }
    
    console.log(`Cleaned base64 length: ${cleanedKey.length} chars`);
    console.log(`First 50 chars: ${cleanedKey.substring(0, 50)}`);
    console.log(`Last 50 chars: ${cleanedKey.substring(cleanedKey.length - 50)}`);
    
    // Validate base64 content
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleanedKey)) {
      const invalidChars = cleanedKey.match(/[^A-Za-z0-9+/=]/g);
      const uniqueInvalid = invalidChars ? [...new Set(invalidChars)] : [];
      throw new Error(`❌ Invalid base64 characters found: ${uniqueInvalid.join(', ')}`);
    }
    console.log('✅ Base64 validation passed');
    
    // Decode base64 to binary
    console.log('Decoding base64...');
    const binaryDer = Uint8Array.from(atob(cleanedKey), c => c.charCodeAt(0));
    console.log(`✅ Decoded to ${binaryDer.length} bytes`);
    
    // Import the private key (PKCS#8 format required)
    console.log('Importing private key...');
    let privateKey;
    try {
      privateKey = await crypto.subtle.importKey(
        'pkcs8',
        binaryDer,
        {
          name: 'RSASSA-PKCS1-v1_5',
          hash: 'SHA-256'
        },
        false,
        ['sign']
      );
      console.log('✅ Private key imported successfully');
    } catch (importError) {
      console.error('❌ Failed to import private key:', importError);
      throw new Error(`Private key import failed. Ensure it's PKCS#8 format (BEGIN PRIVATE KEY). Error: ${importError}`);
    }
    
    // Sign the string
    console.log('Generating signature...');
    const signatureBytes = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      privateKey,
      new TextEncoder().encode(signingString)
    );
    
    // Convert to base64
    const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBytes)));
    console.log(`✅ Signature generated: ${signature.length} chars`);
    console.log(`Signature preview: ${signature.substring(0, 50)}...`);
    console.log('<<< Signature generation complete\n');
    
    return signature;
  } catch (error) {
    console.error('\n❌ ERROR in signRequest:');
    console.error(error);
    
    if (error instanceof Error) {
      if (error.message.includes('atob')) {
        console.error('\n💡 Hint: The private key has invalid base64 encoding.');
        console.error('   Make sure you uploaded the complete PEM file content.');
        console.error('   Command: cat oci_private_key.pem | wrangler secret put OCI_PRIVATE_KEY');
      }
    }
    
    throw error;
  }
}

async function sendTelegramMessage(env: Env, message: string): Promise<void> {
  if (!env.TELEGRAM_BOT_API || !env.TELEGRAM_CHAT_ID) {
    return;
  }
  
  try {
    const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_API}/sendMessage`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text: message
      })
    });
  } catch (error) {
    console.error('Failed to send Telegram message:', error);
  }
}
