"use client"

import { Toaster as Sonner, ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      icons={{
        success: null,
        error: null,
        warning: null,
        info: null,
        loading: null,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: "px-4 py-3 rounded-lg shadow-lg flex flex-col items-center justify-center gap-1 text-sm max-w-[calc(100vw-32px)] ring-1 ring-inset ring-primary bg-background text-foreground",
          title: "font-medium text-sm text-center",
          description: "text-xs text-center text-muted-foreground",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
