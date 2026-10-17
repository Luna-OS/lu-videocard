import type { SVGProps } from "react";

/** Line icons in one style (24×24, 1.75 stroke, round caps), drawn for Lu Videocard. */
function Icon({ children, size = 18, ...rest }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

type P = { size?: number };

export const VolumeIcon = ({ size }: P) => (
  <Icon size={size}>
    <path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" />
    <path d="M15.5 9a4.2 4.2 0 0 1 0 6" />
    <path d="M18 6.5a7.8 7.8 0 0 1 0 11" />
  </Icon>
);

export const VolumeLowIcon = ({ size }: P) => (
  <Icon size={size}>
    <path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" />
    <path d="M15.5 9a4.2 4.2 0 0 1 0 6" />
  </Icon>
);

export const MutedIcon = ({ size }: P) => (
  <Icon size={size}>
    <path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" />
    <path d="m16 9.5 5 5M21 9.5l-5 5" />
  </Icon>
);

export const FullscreenIcon = ({ size }: P) => (
  <Icon size={size}>
    <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
  </Icon>
);

export const ExitFullscreenIcon = ({ size }: P) => (
  <Icon size={size}>
    <path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5" />
  </Icon>
);

/** Stream mode: a window that is nothing but the picture. */
export const StreamIcon = ({ size }: P) => (
  <Icon size={size}>
    <rect x="3" y="5" width="18" height="13" rx="2.5" />
    <path d="M8.5 21h7" />
    <path d="m10.5 9.2 4 2.3-4 2.3z" fill="currentColor" />
  </Icon>
);

export const CameraIcon = ({ size }: P) => (
  <Icon size={size}>
    <path d="M4.5 8h3l1.6-2.5h5.8L16.5 8h3A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-8A1.5 1.5 0 0 1 4.5 8z" />
    <circle cx="12" cy="13" r="3.4" />
  </Icon>
);

export const SettingsIcon = ({ size }: P) => (
  <Icon size={size}>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="17" r="2" />
  </Icon>
);

export const FitIcon = ({ size }: P) => (
  <Icon size={size}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <rect x="7" y="8.5" width="10" height="7" rx="1" />
  </Icon>
);

export const FillIcon = ({ size }: P) => (
  <Icon size={size}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M7 9V8h2M15 8h2v1M17 15v1h-2M9 16H7v-1" />
  </Icon>
);

export const StretchIcon = ({ size }: P) => (
  <Icon size={size}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M6.5 12h11M8.5 10l-2 2 2 2M15.5 10l2 2-2 2" />
  </Icon>
);

export const InfoIcon = ({ size }: P) => (
  <Icon size={size}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5.5M12 7.8v.1" />
  </Icon>
);

export const RefreshIcon = ({ size }: P) => (
  <Icon size={size}>
    <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
    <path d="M19.5 4.5v4h-4" />
  </Icon>
);

export const CloseIcon = ({ size }: P) => (
  <Icon size={size}>
    <path d="m6 6 12 12M18 6 6 18" />
  </Icon>
);

export const DownloadIcon = ({ size }: P) => (
  <Icon size={size}>
    <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14" />
  </Icon>
);

export const PlugIcon = ({ size }: P) => (
  <Icon size={size}>
    <path d="M9 3v4M15 3v4M7 7h10v3.5a5 5 0 0 1-10 0z" />
    <path d="M12 15.5V21" />
  </Icon>
);

export const PinIcon = ({ size }: P) => (
  <Icon size={size}>
    <path d="M9 4h6l-1 5 3 3H7l3-3z" />
    <path d="M12 12v8" />
  </Icon>
);

/** The three window buttons, drawn thin like Windows 11's own. */
export const WinMinimizeIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
    <path d="M0 5h10" stroke="currentColor" strokeWidth="1" />
  </svg>
);
export const WinMaximizeIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
    <rect x="0.5" y="0.5" width="9" height="9" rx="1" fill="none" stroke="currentColor" />
  </svg>
);
export const WinRestoreIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
    <rect x="0.5" y="2.5" width="7" height="7" rx="1" fill="none" stroke="currentColor" />
    <path
      d="M2.5 2.5V1.5a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-1"
      fill="none"
      stroke="currentColor"
    />
  </svg>
);
export const WinCloseIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
    <path d="m0.5 0.5 9 9M9.5 0.5l-9 9" stroke="currentColor" strokeWidth="1" />
  </svg>
);
