export {}

declare global {
  interface Window {
    api: {
      setIgnore: (ignore: boolean) => void
      dragBy: (dx: number, dy: number) => void
    }
  }
}
