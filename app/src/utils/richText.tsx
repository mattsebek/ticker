import React from "react";
import { Text, TextStyle } from "react-native";

/**
 * Splits on **bold** markers (the one markdown exception the Gameweek
 * Preview generator is allowed to use — see editorial/previewGenerator.ts's
 * system prompt) and renders matching spans as nested bold <Text>. Anything
 * that doesn't match is rendered verbatim, so plain strings with no markers
 * pass through unchanged.
 */
export function renderBoldSegments(text: string, boldStyle?: TextStyle): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  if (parts.length === 1) return text;
  return parts.map((part, i) => {
    const match = /^\*\*([^*]+)\*\*$/.exec(part);
    if (!match) return part;
    return (
      <Text key={i} style={[{ fontWeight: "700" }, boldStyle]}>
        {match[1]}
      </Text>
    );
  });
}
