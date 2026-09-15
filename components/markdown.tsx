"use client";

import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

interface MarkdownProps {
  content: string;
  className?: string;
}

const REMARK_PLUGINS = [remarkGfm];

/**
 * Renders assistant Markdown. Memoised so a streaming message only re-parses
 * when its text actually changes. Raw HTML is never rendered (react-markdown
 * escapes it by default), so model output can't inject markup.
 */
export const Markdown = memo(function Markdown({ content, className }: MarkdownProps) {
  return (
    <div className={cn("prose-chat", className)}>
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
