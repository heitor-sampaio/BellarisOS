declare module 'simpleheat' {
  interface SimpleHeat {
    data(data: Array<[number, number, number?]>): this
    max(max: number): this
    radius(r: number, blur?: number): this
    gradient(grad: Record<string, string>): this
    draw(minOpacity?: number): this
    resize(): this
    clear(): this
  }
  function simpleheat(canvas: HTMLCanvasElement): SimpleHeat
  export = simpleheat
}
