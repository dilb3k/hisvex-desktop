const STORAGE_KEY = 'hisvex_block_disabled'

export function isBlockCodeDisabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function setBlockCodeDisabled(disabled: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, disabled ? '1' : '0')
  } catch {
    // localStorage mavjud emas
  }
}
