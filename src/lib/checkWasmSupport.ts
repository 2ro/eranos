/**
 * Check if WebAssembly is supported in the current environment.
 * 
 * iOS Lockdown Mode disables WebAssembly, which breaks wallet functionality
 * that relies on the Breez SDK (which uses WASM for cryptographic operations).
 * 
 * This function performs a comprehensive check including:
 * 1. Basic WebAssembly object existence
 * 2. Ability to compile a minimal WASM module
 * 3. Ability to instantiate the compiled module
 */
export async function checkWasmSupport(): Promise<{
  supported: boolean;
  reason?: string;
}> {
  try {
    // Check if WebAssembly object exists
    if (typeof WebAssembly !== 'object') {
      return {
        supported: false,
        reason: 'WebAssembly is not available in this browser',
      };
    }

    // Check if required functions exist
    if (
      typeof WebAssembly.compile !== 'function' ||
      typeof WebAssembly.instantiate !== 'function'
    ) {
      return {
        supported: false,
        reason: 'WebAssembly compile/instantiate functions are not available',
      };
    }

    // Try to compile and instantiate a minimal WASM module
    // This is the smallest valid WASM module (magic number + version)
    // with an empty section
    const minimalWasmModule = new Uint8Array([
      0x00, 0x61, 0x73, 0x6d, // WASM magic number (\0asm)
      0x01, 0x00, 0x00, 0x00, // WASM version 1
    ]);

    const module = await WebAssembly.compile(minimalWasmModule);
    await WebAssembly.instantiate(module);

    return { supported: true };
  } catch (error) {
    // Specific error messages for different failure modes
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Check for common Lockdown Mode error patterns
    if (
      errorMessage.includes('WebAssembly') ||
      errorMessage.includes('wasm') ||
      errorMessage.includes('Lockdown') ||
      errorMessage.includes('disabled')
    ) {
      return {
        supported: false,
        reason: 'WebAssembly is disabled (possibly due to iOS Lockdown Mode)',
      };
    }

    return {
      supported: false,
      reason: `WebAssembly check failed: ${errorMessage}`,
    };
  }
}

/**
 * Synchronous check for basic WASM support.
 * Use checkWasmSupport() for a more thorough async check.
 */
export function hasBasicWasmSupport(): boolean {
  try {
    return (
      typeof WebAssembly === 'object' &&
      typeof WebAssembly.compile === 'function' &&
      typeof WebAssembly.instantiate === 'function'
    );
  } catch {
    return false;
  }
}
