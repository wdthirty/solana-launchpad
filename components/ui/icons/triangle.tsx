import * as React from "react";

export function Triangle({
  size = 12,
  direction = "up",
  className,
  ...props
}: React.SVGProps<SVGSVGElement> & {
  size?: number;
  direction?: "up" | "down";
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      {...props}
    >
      {direction === "up" ? (
        <path d="M12 4L22 20H2L12 4Z" />
      ) : (
        <path d="M12 20L2 4H22L12 20Z" />
      )}
    </svg>
  );
}
