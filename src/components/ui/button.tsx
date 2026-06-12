import * as React from "react"
import { cn } from "@/lib/utils"

type ButtonVariant = "default" | "secondary" | "ghost" | "link"
type ButtonSize = "default" | "sm" | "lg" | "icon"

const baseButtonClass =
  "inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-semibold transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-px disabled:pointer-events-none disabled:opacity-50"

const variantClasses: Record<ButtonVariant, string> = {
  default: "glass-button-primary text-[#101114] hover:-translate-y-0.5 hover:shadow-lg",
  secondary: "glass-button-secondary text-foreground hover:bg-white/26",
  ghost: "hover:bg-accent hover:text-accent-foreground",
  link: "text-primary underline-offset-4 hover:underline",
}

const sizeClasses: Record<ButtonSize, string> = {
  default: "h-12 px-6",
  sm: "h-9 px-4",
  lg: "h-14 px-8 text-base",
  icon: "h-11 w-11",
}

function buttonVariants({
  variant = "default",
  size = "default",
  className,
}: {
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
} = {}) {
  return cn(baseButtonClass, variantClasses[variant], sizeClasses[size], className)
}

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    Partial<{
      variant: ButtonVariant
      size: ButtonSize
    }> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
