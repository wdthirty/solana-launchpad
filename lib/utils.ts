import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Compiler would throw an error if a switch-case is not exhaustive.
 * @see {@link https://www.typescriptlang.org/docs/handbook/unions-and-intersections.html#union-exhaustiveness-checking Unions and Intersection Types}
 */
export function assertNever(_arg: never, message = 'Unknown error occured.'): never {
  throw new Error(message);
}

export const getBaseUrl = () => {
  if (process.env.NODE_ENV === 'development') {
    return `http://localhost:3000`;
  } else {
    let url = process.env.NEXT_PUBLIC_VERCEL_BRANCH_URL;

    if (url?.includes('vercel.app')) {
      url = `https://${process.env.NEXT_PUBLIC_VERCEL_BRANCH_URL}`;
    } else {
      url = `https://jup.ag`;
    }

    return typeof window === 'undefined' ? url : window.location.origin;
  }
};

/**
 * Serialize value to string
 */
export function serializeValue(value: unknown): string {
  // String
  if (typeof value === 'string') {
    return value;
  }
  // Boolean
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  // Number
  if (typeof value === 'number') {
    return value.toString();
  }
  // BigInt
  if (typeof value === 'bigint') {
    return value.toString();
  }
  // Date
  if (value instanceof Date) {
    return value.toISOString();
  }
  // Array, join with comma delimiter
  if (Array.isArray(value)) {
    return value.map((v) => serializeValue(v)).join(',');
  }
  throw new Error(`Cannot serialize value: ${value}`);
}

/**
 * Serialize params to a new object with all values serialized to strings.
 */
export function serializeParams(params: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(params)
      .filter(([, v]) => v !== undefined) // Remove undefined values
      .map(([k, v]) => [k, serializeValue(v)])
  );
}

export function shortenAddress(address: string) {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export const delay = async (time: number) =>
  await new Promise((resolve) => setTimeout(resolve, time));

/**
 * CDN hostnames that should not be proxied
 * These either have CORS issues or don't work well with transformations
 */
const CDN_BLACKLIST: RegExp[] = [
  /i\.imgur\.com/,
  /gateway\.irys\.xyz/,
];

/**
 * Hostnames that are already optimized CDNs - pass through without transformation
 */
const OPTIMIZED_CDNS: RegExp[] = [
  /wsrv\.nl/,
];

/**
 * Our CDN domain for Supabase storage
 */
const OUR_CDN_DOMAIN = 'cdn.launchpad.fun';
const SUPABASE_STORAGE_PATH = '/storage/v1/object/public/';
const SUPABASE_RENDER_PATH = '/storage/v1/render/image/public/';

/**
 * Get an optimized CDN URL for an image
 *
 * For our own CDN (cdn.launchpad.fun): Uses Supabase native image transforms
 * - Single hop (no proxy)
 * - Edge-cached with Cloudflare
 * - Native resizing without double optimization
 *
 * For external URLs: Uses wsrv.nl as fallback proxy
 *
 * @param url - Original image URL
 * @param width - Desired width in pixels
 * @param height - Desired height in pixels (defaults to width for square)
 * @param cacheKey - Optional cache-busting key (e.g., updated_at timestamp)
 * @returns Optimized CDN URL or original URL if blacklisted
 */
export function getOptimizedImageUrl(
  url: string | null | undefined,
  width: number,
  height?: number,
  cacheKey?: string | number | null
): string | undefined {
  if (!url) return undefined;

  try {
    const src = new URL(url, getBaseUrl());
    const actualHeight = height ?? width;
    // Use 1.5x DPR instead of 2x for better performance/quality balance
    const scaledWidth = Math.ceil(width * 1.5);
    const scaledHeight = Math.ceil(actualHeight * 1.5);

    // Check if already optimized (wsrv.nl)
    if (OPTIMIZED_CDNS.some((regex) => regex.test(src.hostname))) {
      return url;
    }

    // Check blacklist
    if (CDN_BLACKLIST.some((regex) => regex.test(src.hostname))) {
      return url;
    }

    // For our own CDN, use Supabase native image transforms (faster, single hop)
    if (src.hostname === OUR_CDN_DOMAIN && src.pathname.includes(SUPABASE_STORAGE_PATH)) {
      // Convert /storage/v1/object/public/... to /storage/v1/render/image/public/...
      const renderPath = src.pathname.replace(SUPABASE_STORAGE_PATH, SUPABASE_RENDER_PATH);
      const transformUrl = new URL(`https://${OUR_CDN_DOMAIN}${renderPath}`);
      transformUrl.searchParams.set('width', scaledWidth.toString());
      transformUrl.searchParams.set('height', scaledHeight.toString());
      transformUrl.searchParams.set('resize', 'cover');
      // Add cache-busting key if provided
      if (cacheKey) {
        transformUrl.searchParams.set('v', String(cacheKey));
      }
      return transformUrl.toString();
    }

    // For external URLs, use wsrv.nl as fallback proxy
    const cdnUrl = new URL('https://wsrv.nl');
    cdnUrl.searchParams.set('url', src.toString());
    cdnUrl.searchParams.set('w', scaledWidth.toString());
    cdnUrl.searchParams.set('h', scaledHeight.toString());
    cdnUrl.searchParams.set('fit', 'cover');
    // Add cache-busting key if provided
    if (cacheKey) {
      cdnUrl.searchParams.set('v', String(cacheKey));
    }

    return cdnUrl.toString();
  } catch {
    return url;
  }
}

/**
 * Convert background position data to CSS transform-based styles
 * Used for panels and page backgrounds with position/zoom controls
 *
 * Uses the same technique as react-easy-crop's official example:
 * https://codesandbox.io/p/sandbox/react-easy-crop-with-live-output-kkqj0
 *
 * The transform approach:
 * - scale = 100 / cropArea.width (how much to enlarge the image)
 * - translateX = -cropArea.x * scale (how much to shift left)
 * - translateY = -cropArea.y * scale (how much to shift up)
 *
 * @param pos - Position data as JSON string ({cropArea}) or legacy CSS string ("center center")
 * @returns Object with CSS transform properties for accurate crop display
 */
export function parseBackgroundPosition(pos: string | undefined): {
  position: string;
  size: string;
  // New transform-based approach (preferred)
  transform?: string;
  transformOrigin?: string;
  width?: string;
  height?: string;
} {
  if (!pos) {
    return { position: 'center center', size: 'cover' };
  }

  try {
    const data = JSON.parse(pos);

    // If we have cropArea data from react-easy-crop, use transform-based approach
    if (data.cropArea) {
      const { x, y, width } = data.cropArea;

      // Calculate transform using the official react-easy-crop formula
      const scale = 100 / width;
      const transformX = -x * scale;
      const transformY = -y * scale;

      return {
        // Transform-based properties (use these for accurate display)
        transform: `translate3d(${transformX}%, ${transformY}%, 0) scale3d(${scale}, ${scale}, 1)`,
        transformOrigin: 'top left',
        width: 'calc(100% + 0.5px)', // Prevent subpixel gaps
        height: 'auto',
        // Legacy fallback properties (less accurate, but works for background-image)
        position: 'center center',
        size: `${scale * 100}%`,
      };
    }

    // Fallback for old format without cropArea
    const zoom = data.zoom || 1;
    const cropX = data.x || 0;
    const cropY = data.y || 0;

    const size = `${zoom * 100}%`;
    const posX = 50 - (cropX * zoom / 200);
    const posY = 50 - (cropY * zoom / 200);

    return {
      position: `${Math.max(0, Math.min(100, posX))}% ${Math.max(0, Math.min(100, posY))}%`,
      size
    };
  } catch {
    // Fallback for old format like "center center"
    return { position: pos, size: 'cover' };
  }
}
