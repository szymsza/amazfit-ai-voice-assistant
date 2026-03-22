export function assets(type: string) {
  return (path: string) => type + '/' + path
}
