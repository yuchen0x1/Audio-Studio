/**
 * 图标集：内联 SVG（无第三方依赖），stroke 风格统一 1.7px。
 * 所有图标继承 currentColor，尺寸默认 18。
 */
import type { SVGProps } from 'react';

export type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 18, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

/* ---- 导航 ---- */
export const IconHome = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5.5 9.5V20a1 1 0 0 0 1 1H10v-5.5h4V21h3.5a1 1 0 0 0 1-1V9.5" />
  </Svg>
);
export const IconConvert = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h13m0 0-3.5-3.5M17 7l-3.5 3.5" />
    <path d="M20 17H7m0 0 3.5-3.5M7 17l3.5 3.5" />
  </Svg>
);
export const IconBatch = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="4" width="12" height="12" rx="2" />
    <path d="M8.5 20h9a3 3 0 0 0 3-3V8.5" />
    <path d="M7 10h5M7 13h5" />
  </Svg>
);
export const IconClip = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 6.5h16M4 17.5h16" />
    <path d="M8 6.5v11M16 6.5v11" strokeDasharray="2.5 2.5" />
    <circle cx="8" cy="12" r="1.6" fill="currentColor" stroke="none" />
    <circle cx="16" cy="12" r="1.6" fill="currentColor" stroke="none" />
  </Svg>
);
export const IconMerge = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 6h5l3 6 3-6h5" />
    <path d="M4 18h5l3-6" />
    <path d="M15 12l3 6h2" />
  </Svg>
);
export const IconAnalyze = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 12h2.5l2-6 3 12 2.5-9 2 5H21" />
  </Svg>
);
export const IconMetadata = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 18V6l10-2v12" />
    <circle cx="6.5" cy="18" r="2.5" />
    <circle cx="16.5" cy="16" r="2.5" />
  </Svg>
);
export const IconHistory = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
    <path d="M3.5 4.5V9H8" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
);
export const IconSettings = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19 12a7 7 0 0 0-.14-1.4l2.1-1.63-2-3.46-2.48 1a7 7 0 0 0-2.42-1.4L13.6 2.5h-4l-.46 2.6a7 7 0 0 0-2.42 1.4l-2.48-1-2 3.47 2.1 1.62A7 7 0 0 0 4.2 12c0 .48.05.94.14 1.4l-2.1 1.63 2 3.46 2.48-1a7 7 0 0 0 2.42 1.4l.46 2.61h4l.46-2.6a7 7 0 0 0 2.42-1.4l2.48 1 2-3.47-2.1-1.62c.09-.46.14-.92.14-1.4Z" />
  </Svg>
);

/* ---- 操作 ---- */
export const IconPlay = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 5.5v13l11-6.5Z" fill="currentColor" stroke="none" />
  </Svg>
);
export const IconPause = (p: IconProps) => (
  <Svg {...p}>
    <rect x="6.5" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none" />
    <rect x="14" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none" />
  </Svg>
);
export const IconStop = (p: IconProps) => (
  <Svg {...p}>
    <rect x="6.5" y="6.5" width="11" height="11" rx="1.5" fill="currentColor" stroke="none" />
  </Svg>
);
export const IconPrev = (p: IconProps) => (
  <Svg {...p}>
    <path d="M17.5 6v12L9 12Z" fill="currentColor" stroke="none" />
    <rect x="5" y="6" width="2" height="12" rx="1" fill="currentColor" stroke="none" />
  </Svg>
);
export const IconNext = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6.5 6v12L15 12Z" fill="currentColor" stroke="none" />
    <rect x="17" y="6" width="2" height="12" rx="1" fill="currentColor" stroke="none" />
  </Svg>
);
export const IconUpload = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" />
    <path d="M4 16v2.5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V16" />
  </Svg>
);
export const IconDownload = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4v12m0 0 4.5-4.5M12 16l-4.5-4.5" />
    <path d="M4 16v2.5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V16" />
  </Svg>
);
export const IconTrash = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16" />
    <path d="M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2" />
    <path d="M6.5 7l.8 12a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9l.8-12" />
    <path d="M10 11v5M14 11v5" />
  </Svg>
);
export const IconClose = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);
export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="m4.5 12.5 5 5 10-11" />
  </Svg>
);
export const IconPlus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);
export const IconSearch = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </Svg>
);
export const IconCopy = (p: IconProps) => (
  <Svg {...p}>
    <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
    <path d="M5.5 15.5A2 2 0 0 1 4 13.5v-8A2 2 0 0 1 6 3.5h7.5a2 2 0 0 1 2 2" />
  </Svg>
);
export const IconFolder = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 7a2 2 0 0 1 2-2H10l2 2.5h6.5a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" />
  </Svg>
);
export const IconExternal = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 4h6v6" />
    <path d="M20 4 11 13" />
    <path d="M19 13.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 3 19V6a1.5 1.5 0 0 1 1.5-1.5H10" />
  </Svg>
);
export const IconInfo = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5" />
    <circle cx="12" cy="8" r="0.6" fill="currentColor" />
  </Svg>
);
export const IconWarning = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.8 2.8 19.5h18.4Z" />
    <path d="M12 9.5v4.5" />
    <circle cx="12" cy="16.6" r="0.6" fill="currentColor" />
  </Svg>
);
export const IconRefresh = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 12a8 8 0 1 1-2.5-5.8" />
    <path d="M20 3.5V8h-4.5" />
  </Svg>
);

/* ---- 播放器 ---- */
export const IconVolume = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5Z" fill="currentColor" stroke="none" />
    <path d="M15 9a4.5 4.5 0 0 1 0 6" />
    <path d="M17.5 6.5a8 8 0 0 1 0 11" />
  </Svg>
);
export const IconMute = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5Z" fill="currentColor" stroke="none" />
    <path d="m15.5 9.5 5 5M20.5 9.5l-5 5" />
  </Svg>
);
export const IconLoop = (p: IconProps) => (
  <Svg {...p}>
    <path d="M17 3.5 20.5 7 17 10.5" />
    <path d="M3.5 12V10a3 3 0 0 1 3-3h14" />
    <path d="M7 20.5 3.5 17 7 13.5" />
    <path d="M20.5 12v2a3 3 0 0 1-3 3h-14" />
  </Svg>
);
export const IconLoopOne = (p: IconProps) => (
  <Svg {...p}>
    <path d="M17 3.5 20.5 7 17 10.5" />
    <path d="M3.5 12V10a3 3 0 0 1 3-3h14" />
    <path d="M7 20.5 3.5 17 7 13.5" />
    <path d="M20.5 12v2a3 3 0 0 1-3 3h-14" />
    <text x="10.6" y="14.4" fontSize="7.5" fill="currentColor" stroke="none" fontWeight="700">
      1
    </text>
  </Svg>
);
export const IconShuffle = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 6.5h3.2c5 0 5.6 11 10.6 11h3.2" />
    <path d="M3.5 17.5h3.2c2.3 0 3.6-2.2 4.7-4.6" />
    <path d="M14.5 8.4c1-1.3 2.2-1.9 3.8-1.9h2.2" />
    <path d="m17.8 3.5 3 3-3 3" />
    <path d="m17.8 14.5 3 3-3 3" />
  </Svg>
);
export const IconList = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8.5 6.5H21M8.5 12H21M8.5 17.5H21" />
    <circle cx="4.5" cy="6.5" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="4.5" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="4.5" cy="17.5" r="1.2" fill="currentColor" stroke="none" />
  </Svg>
);

/* ---- 其它 ---- */
export const IconWave = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 12h2l2-5 3 10 3-14 3 18 2-9h3" />
  </Svg>
);
export const IconMusic = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 18V6l11-2.5V15" />
    <circle cx="6.5" cy="18" r="2.5" />
    <circle cx="17.5" cy="15" r="2.5" />
  </Svg>
);
export const IconSun = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5 5l1.8 1.8M17.2 17.2 19 19M19 5l-1.8 1.8M6.8 17.2 5 19" />
  </Svg>
);
export const IconMoon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z" />
  </Svg>
);
export const IconGlobe = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5c2.5 2.4 3.7 5.3 3.7 8.5S14.5 18.1 12 20.5c-2.5-2.4-3.7-5.3-3.7-8.5S9.5 5.9 12 3.5Z" />
  </Svg>
);
export const IconMenu = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 6.5h16M4 12h16M4 17.5h16" />
  </Svg>
);
export const IconChevronDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="m6 9.5 6 6 6-6" />
  </Svg>
);
export const IconChevronRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="m9.5 6 6 6-6 6" />
  </Svg>
);
export const IconArrowUp = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 20V4.5M12 4.5 5.5 11M12 4.5 18.5 11" />
  </Svg>
);
export const IconArrowDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4v15.5M12 19.5 5.5 13M12 19.5 18.5 13" />
  </Svg>
);
export const IconScissors = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="6.5" cy="7" r="2.5" />
    <circle cx="6.5" cy="17" r="2.5" />
    <path d="M8.7 8.5 20 17M8.7 15.5 20 7" />
  </Svg>
);
export const IconZoomIn = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M11 8.5v5M8.5 11h5M16 16l4.5 4.5" />
  </Svg>
);
export const IconZoomOut = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M8.5 11h5M16 16l4.5 4.5" />
  </Svg>
);
export const IconBell = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 9a6 6 0 0 1 12 0c0 4.5 2 6 2 6H4s2-1.5 2-6Z" />
    <path d="M10 19a2 2 0 0 0 4 0" />
  </Svg>
);
export const IconShield = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3 5 6v5.5c0 4.4 3 7.7 7 9.5 4-1.8 7-5.1 7-9.5V6Z" />
    <path d="m9 12 2 2 4-4.5" />
  </Svg>
);
export const IconDrag = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="6" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="15" cy="6" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="9" cy="12" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="15" cy="12" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="9" cy="18" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="15" cy="18" r="1.3" fill="currentColor" stroke="none" />
  </Svg>
);
export const IconEdit = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17Z" />
    <path d="m14.5 7 3 3" />
  </Svg>
);
export const IconFile = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6.5 3.5h7l4.5 4.5v12a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 5 20V5a1.5 1.5 0 0 1 1.5-1.5Z" />
    <path d="M13.5 3.5V8H18" />
  </Svg>
);
export const IconCpu = (p: IconProps) => (
  <Svg {...p}>
    <rect x="7" y="7" width="10" height="10" rx="1.5" />
    <path d="M10 3.5v3.5M14 3.5v3.5M10 17v3.5M14 17v3.5M3.5 10H7M3.5 14H7M17 10h3.5M17 14h3.5" />
  </Svg>
);
