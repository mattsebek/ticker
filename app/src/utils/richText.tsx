import React from "react";
import { Text, TextStyle } from "react-native";
import { GREEN } from "../theme/theme";

/**
 * Splits on **bold** and ++green bold++ markers (the markdown exceptions the
 * Gameweek Preview generator/admin are allowed to use — see
 * editorial/previewGenerator.ts's system prompt) and renders matching spans
 * as nested bold <Text>. Anything that doesn't match is rendered verbatim,
 * so plain strings with no markers pass through unchanged.
 */
export function renderBoldSegments(text: string, boldStyle?: TextStyle): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\+\+[^+]+\+\+)/g).filter(Boolean);
  if (parts.length === 1) return text;
  return parts.map((part, i) => {
    const boldMatch = /^\*\*([^*]+)\*\*$/.exec(part);
    if (boldMatch) {
      return (
        <Text key={i} style={[{ fontWeight: "700" }, boldStyle]}>
          {boldMatch[1]}
        </Text>
      );
    }
    const greenMatch = /^\+\+([^+]+)\+\+$/.exec(part);
    if (greenMatch) {
      return (
        <Text key={i} style={[{ fontWeight: "700", color: GREEN }, boldStyle]}>
          {greenMatch[1]}
        </Text>
      );
    }
    return part;
  });
}
