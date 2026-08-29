type IconProps = {
  className?: string;
};

export function BuildingIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 3h12a2 2 0 0 1 2 2v16H4V3Z" />
      <path d="M18 9h2a2 2 0 0 1 2 2v10h-4V9Z" />
      <path d="M8 7h3M8 11h3M8 15h3" />
    </svg>
  );
}

export function BellIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  );
}

export function LoginIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10 17 15 12 10 7" />
      <path d="M15 12H3" />
      <path d="M15 5h4a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-4" />
    </svg>
  );
}

export function LogoutIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17 21 12 16 7" />
      <path d="M21 12H9" />
    </svg>
  );
}

export function ClockIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function LeaveIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 20c.6-5.8 4.2-10.4 10-13" />
      <path d="M5 6c5-3 10-2 15 3-6 .3-10 2.3-12 7" />
      <path d="M9 14 5 10" />
    </svg>
  );
}

export function HolidayIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 11 9-9 3 3-9 9" />
      <path d="m14 7 3 3" />
      <path d="M5 11 3 21l10-2" />
      <path d="M18 14h2M17 18l2 2M21 10l-2 2" />
    </svg>
  );
}

export function WarningIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="m12 3 10 18H2L12 3Z" />
      <path d="M12 9v5M12 17h.01" />
    </svg>
  );
}
