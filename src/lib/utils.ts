type ClassInput =
  | string
  | number
  | false
  | null
  | undefined
  | ClassInput[]
  | Record<string, boolean | null | undefined>

function flattenClass(input: ClassInput, output: string[]) {
  if (!input) {
    return
  }

  if (typeof input === "string" || typeof input === "number") {
    output.push(String(input))
    return
  }

  if (Array.isArray(input)) {
    input.forEach((item) => flattenClass(item, output))
    return
  }

  Object.entries(input).forEach(([key, value]) => {
    if (value) {
      output.push(key)
    }
  })
}

export function cn(...inputs: ClassInput[]) {
  const classes: string[] = []
  inputs.forEach((input) => flattenClass(input, classes))
  return classes.join(" ")
}
