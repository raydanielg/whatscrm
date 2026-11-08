import { Fragment, type ReactNode } from "react";
import {
  Linking,
  Platform,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
} from "react-native";
import { parseRichText, type RichInline, type RichNode } from "@/lib/rich-text";

const MONOSPACE = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

type Props = {
  /** Raw WhatsApp-flavoured text. */
  value?: string | null;
  /** Merged into every rendered line — keep the caller's colour / font size here. */
  style?: StyleProp<TextStyle>;
  /** Defaults to the text colour with an underline. */
  linkColor?: string;
  selectable?: boolean;
};

function openLink(href: string) {
  Linking.openURL(href).catch(() => {});
}

function renderInline(nodes: RichInline[], linkColor: string, keyBase = "i"): ReactNode {
  return nodes.map((node, idx) => {
    const key = `${keyBase}-${idx}`;
    switch (node.type) {
      case "text":
        return <Fragment key={key}>{node.value}</Fragment>;
      case "bold":
        return (
          <Text key={key} style={{ fontWeight: "700" }}>
            {renderInline(node.children, linkColor, key)}
          </Text>
        );
      case "italic":
        return (
          <Text key={key} style={{ fontStyle: "italic" }}>
            {renderInline(node.children, linkColor, key)}
          </Text>
        );
      case "strike":
        return (
          <Text key={key} style={{ textDecorationLine: "line-through" }}>
            {renderInline(node.children, linkColor, key)}
          </Text>
        );
      case "code":
        return (
          <Text key={key} style={{ fontFamily: MONOSPACE }}>
            {node.value}
          </Text>
        );
      case "link":
        return (
          <Text
            key={key}
            accessibilityRole="link"
            onPress={() => openLink(node.href)}
            style={{ color: linkColor, textDecorationLine: "underline" }}
          >
            {node.value}
          </Text>
        );
      default:
        return null;
    }
  });
}

/**
 * Renders WhatsApp-style formatting with nested `<Text>` elements.
 * Pass the caller's colour/size through `style` — it is merged into every line.
 */
export function RichText({ value, style, linkColor, selectable }: Props) {
  const blocks = parseRichText(value);
  if (!blocks.length) return null;

  const flat = StyleSheet.flatten(style) ?? {};
  const color = (flat.color as string | undefined) ?? undefined;
  const link = linkColor ?? color ?? undefined;

  return (
    <View style={{ gap: 2 }}>
      {blocks.map((block, idx) => (
        <Block
          key={`b-${idx}`}
          block={block}
          style={style}
          link={link}
          color={color}
          selectable={selectable}
        />
      ))}
    </View>
  );
}

function Block({
  block,
  style,
  link,
  color,
  selectable,
}: {
  block: RichNode;
  style: StyleProp<TextStyle>;
  link?: string;
  color?: string;
  selectable?: boolean;
}) {
  if (block.type === "codeblock") {
    return (
      <View
        style={{
          borderRadius: 6,
          paddingHorizontal: 8,
          paddingVertical: 6,
          backgroundColor: "rgba(127,127,127,0.18)",
        }}
      >
        <Text selectable={selectable} style={[style, { fontFamily: MONOSPACE }]}>
          {block.value}
        </Text>
      </View>
    );
  }

  if (block.type === "quote") {
    return (
      <View style={{ flexDirection: "row", gap: 6 }}>
        <View
          style={{
            width: 3,
            borderRadius: 2,
            backgroundColor: color ?? "rgba(127,127,127,0.6)",
            opacity: 0.5,
          }}
        />
        <Text selectable={selectable} style={[style, { flex: 1, opacity: 0.85 }]}>
          {renderInline(block.children, link ?? "")}
        </Text>
      </View>
    );
  }

  if (block.type === "bullet" || block.type === "ordered") {
    const marker = block.type === "bullet" ? "•" : block.marker;
    return (
      <View style={{ flexDirection: "row", gap: 6, paddingLeft: 2 }}>
        <Text style={[style, { opacity: 0.8 }]}>{marker}</Text>
        <Text selectable={selectable} style={[style, { flex: 1 }]}>
          {renderInline(block.children, link ?? "")}
        </Text>
      </View>
    );
  }

  return (
    <Text selectable={selectable} style={style}>
      {renderInline(block.children, link ?? "")}
    </Text>
  );
}
