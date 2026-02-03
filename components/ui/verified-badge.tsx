import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface VerifiedBadgeProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "w-3.5 h-3.5",
  md: "w-4 h-4",
  lg: "w-5 h-5",
};

export function VerifiedBadge({ className, size = "sm" }: VerifiedBadgeProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <img
            src="https://ipfs.io/ipfs/bafkreifn2verhnir6r3lj6rmu4tdtmcpoyfl7epvm7y2nvpwsubbha6ora"
            alt="Verified"
            className={cn("flex-shrink-0", sizeClasses[size], className)}
          />
        </TooltipTrigger>
        <TooltipContent>
          <p>Approved via AssureDefi KYC</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
