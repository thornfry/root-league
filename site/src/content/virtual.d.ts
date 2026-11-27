declare module 'virtual:league-info' {
  const pages: readonly {
    key: string
    file: string
    label: string
    html: string
  }[]
  export default pages
}
