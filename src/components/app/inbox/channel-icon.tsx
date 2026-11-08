import type { ComponentType } from "react";
import { Globe, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import emailIconAsset from "@/assets/channel-icons/email.png";
import liveChatIconAsset from "@/assets/channel-icons/live-chat.png";
import smsIconAsset from "@/assets/channel-icons/sms.png";

export type ChannelKey =
  | "whatsapp"
  | "instagram"
  | "messenger"
  | "telegram"
  | "email"
  | "sms"
  | "livechat"
  | "live_chat"
  | "webchat"
  | "voice"
  | "web"
  | string;

type IconProps = { className?: string; style?: React.CSSProperties };
type BrandIcon = ComponentType<IconProps>;

function assetIcon(src: string): BrandIcon {
  return function AssetIcon({ className, style }: IconProps) {
    return (
      <img
        src={src}
        alt=""
        aria-hidden="true"
        draggable={false}
        className={cn("block object-cover", className)}
        style={style}
      />
    );
  };
}

/**
 * Brand marks as round badges: a colored circle with a white glyph, matching
 * the channel logos used across the app.
 */
function Badge({
  bg,
  gradientId,
  gradient,
  className,
  style,
  children,
}: IconProps & {
  bg?: string;
  gradientId?: string;
  gradient?: [string, string, string];
  children: React.ReactNode;
}) {
  return (
    <svg viewBox="0 0 512 512" className={className} style={style} aria-hidden="true">
      {gradient && gradientId && (
        <defs>
          <linearGradient id={gradientId} x1="0" y1="1" x2="0.3" y2="0">
            <stop offset="0" stopColor={gradient[0]} />
            <stop offset="0.5" stopColor={gradient[1]} />
            <stop offset="1" stopColor={gradient[2]} />
          </linearGradient>
        </defs>
      )}
      <circle
        cx="256"
        cy="256"
        r="256"
        fill={gradient && gradientId ? `url(#${gradientId})` : bg}
      />
      {children}
    </svg>
  );
}

const WhatsAppIcon: BrandIcon = (p) => (
  <Badge {...p} bg="#2CA51F">
    <path
      fill="none"
      stroke="#fff"
      strokeWidth="30"
      strokeLinejoin="round"
      d="M140 370 L158 300 A130 130 0 1 1 212 352 Z"
    />
    <path
      fill="#fff"
      d="M200 180c-8 0-16 6-20 16-6 14 2 40 26 70 28 34 60 52 80 56 12 2 22-6 26-14 3-6 1-10-4-14l-22-12c-5-3-10-2-14 2l-8 9c-16-7-34-25-42-41l7-8c4-4 5-9 2-14l-12-22c-3-4-6-6-10-6z"
    />
  </Badge>
);

const MessengerIcon: BrandIcon = (p) => (
  <Badge {...p} bg="#0078FF">
    <path
      fill="#fff"
      d="M256 110c-82 0-148 61-148 137 0 42 21 80 54 105v50l49-27c14 4 30 6 45 6 82 0 148-61 148-137S338 110 256 110z"
    />
    <path fill="#0078FF" d="M142 290l84-89 40 40 79-40-84 89-40-40z" />
  </Badge>
);

const InstagramIcon: BrandIcon = (p) => (
  <Badge {...p} gradientId="ig-grad" gradient={["#FDC830", "#D8267A", "#7C2BCF"]}>
    <rect
      x="130"
      y="130"
      width="252"
      height="252"
      rx="78"
      fill="none"
      stroke="#fff"
      strokeWidth="30"
    />
    <circle cx="256" cy="256" r="62" fill="none" stroke="#fff" strokeWidth="30" />
    <circle cx="340" cy="172" r="19" fill="#fff" />
  </Badge>
);

const TelegramIcon: BrandIcon = (p) => (
  <Badge {...p} bg="#039BE5">
    <path
      fill="#fff"
      d="M116 252l245-98c12-4 22 3 18 18l-42 200c-3 13-11 16-22 10l-60-44-29 28c-3 3-6 6-12 6l4-60 110-100c5-4-1-7-7-3l-136 86-58-18c-13-4-13-13 3-19z"
    />
  </Badge>
);

const FacebookIcon: BrandIcon = (p) => (
  <Badge {...p} bg="#1877F2">
    <path
      fill="#fff"
      d="M282 420V276h48l8-56h-56v-36c0-16 5-27 28-27h30v-50c-5-1-23-2-44-2-44 0-74 27-74 76v39h-49v56h49v144z"
    />
  </Badge>
);

const YouTubeIcon: BrandIcon = (p) => (
  <Badge {...p} bg="#FF0000">
    <rect x="116" y="166" width="280" height="180" rx="48" fill="#fff" />
    <path fill="#FF0000" d="M226 210v92l80-46z" />
  </Badge>
);

const LinkedInIcon: BrandIcon = (p) => (
  <Badge {...p} bg="#0A66C2">
    <rect x="150" y="214" width="46" height="150" fill="#fff" />
    <circle cx="173" cy="168" r="27" fill="#fff" />
    <path
      fill="#fff"
      d="M232 214h44v21c9-15 27-26 54-26 46 0 58 30 58 72v83h-46v-75c0-20-4-38-27-38-24 0-37 16-37 41v72h-46z"
    />
  </Badge>
);

const TikTokIcon: BrandIcon = (p) => (
  <Badge {...p} bg="#111111">
    <path
      fill="#fff"
      d="M300 120c6 40 30 66 70 70v48c-26 0-50-8-70-22v104c0 54-44 92-94 92s-92-40-92-90c0-56 50-98 106-88v50c-26-8-56 10-56 38 0 22 18 40 42 40s44-18 44-46V120z"
    />
  </Badge>
);

const EmailIcon = assetIcon(emailIconAsset);
const LiveChatIcon = assetIcon(liveChatIconAsset);

const KakaoIcon: BrandIcon = (p) => (
  <Badge {...p} bg="#FEE500">
    <path
      fill="#3C1E1E"
      d="M256 150c-96 0-174 60-174 134 0 48 32 90 80 114l-20 74c-2 6 5 11 10 7l86-56c6 1 12 1 18 1 96 0 174-60 174-140S352 150 256 150z"
    />
    <text
      x="256"
      y="290"
      textAnchor="middle"
      fontFamily="Arial, sans-serif"
      fontWeight="800"
      fontSize="92"
      fill="#FEE500"
    >
      TALK
    </text>
  </Badge>
);

const SmsIcon = assetIcon(smsIconAsset);
const VoiceIcon: BrandIcon = (p) => <Phone className={p.className} style={p.style} />;
const GlobeIcon: BrandIcon = (p) => <Globe className={p.className} style={p.style} />;

const MAP: Record<string, { label: string; color: string; Icon: BrandIcon }> = {
  whatsapp: { label: "WhatsApp", color: "#2CA51F", Icon: WhatsAppIcon },
  instagram: { label: "Instagram", color: "#D8267A", Icon: InstagramIcon },
  messenger: { label: "Messenger", color: "#0078FF", Icon: MessengerIcon },
  telegram: { label: "Telegram", color: "#039BE5", Icon: TelegramIcon },
  facebook: { label: "Facebook", color: "#1877F2", Icon: FacebookIcon },
  youtube: { label: "YouTube", color: "#FF0000", Icon: YouTubeIcon },
  linkedin: { label: "LinkedIn", color: "#0A66C2", Icon: LinkedInIcon },
  tiktok: { label: "TikTok", color: "#111111", Icon: TikTokIcon },
  email: { label: "Email", color: "#43B52A", Icon: EmailIcon },
  sms: { label: "SMS", color: "#E12645", Icon: SmsIcon },
  livechat: { label: "Live Chat", color: "#F76745", Icon: LiveChatIcon },
  live_chat: { label: "Live Chat", color: "#F76745", Icon: LiveChatIcon },
  webchat: { label: "Live Chat", color: "#F76745", Icon: LiveChatIcon },
  kakao: { label: "KakaoTalk", color: "#FEE500", Icon: KakaoIcon },
  voice: { label: "Voice", color: "#0F766E", Icon: VoiceIcon },
  web: { label: "Web", color: "#64748B", Icon: GlobeIcon },
};

export function channelMeta(key?: string | null) {
  const k = (key ?? "").toLowerCase();
  return MAP[k] ?? { label: key ?? "Unknown", color: "#64748B", Icon: GlobeIcon };
}

export function ChannelIcon({
  channel,
  className,
  iconClassName,
  withDot = false,
  boxed = false,
}: {
  channel?: string | null;
  className?: string;
  iconClassName?: string;
  /** Prefix a small status dot in the channel's color (plain style only). */
  withDot?: boolean;
  /** Round brand badge (default for list/header). Plain renders the glyph only. */
  boxed?: boolean;
}) {
  const { Icon, color, label } = channelMeta(channel);

  if (boxed) {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full",
          className,
        )}
        title={label}
        aria-label={label}
      >
        {/* Inline size wins over parent rules like Button's `[&_svg]:size-4`, which otherwise shrink the logo to 16px. */}
        <Icon
          className={cn("block h-3.5 w-3.5", iconClassName)}
          style={{ width: "100%", height: "100%" }}
        />
      </span>
    );
  }

  return (
    <span
      className={cn("inline-flex items-center justify-center", className)}
      title={label}
      aria-label={label}
    >
      {withDot && <span className="h-1.5 w-1.5 rounded-full " style={{ background: color }} />}
      <Icon className={cn("h-3.5 w-3.5", iconClassName)} style={{ color }} />
    </span>
  );
}
