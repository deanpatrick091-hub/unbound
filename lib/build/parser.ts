import { FILE_END, FILE_START, isSiteFileName, type SiteFileName } from "@/lib/build/types";

export type ParsedPiece =
  | { kind: "text"; text: string }
  | { kind: "file_start"; name: SiteFileName }
  | { kind: "file"; name: SiteFileName; content: string };

const FENCE_FILES: Record<string, SiteFileName> = {
  html: "index.html", "index.html": "index.html",
  css: "styles.css", "styles.css": "styles.css",
  js: "script.js", javascript: "script.js", "script.js": "script.js",
};

/** Parse complete lines so tokens split across stream chunks cannot leak into
 * chat. Accept our file protocol and ordinary fenced HTML/CSS/JS answers. */
export class BuildOutputParser {
  private buffer = "";
  private currentFile: SiteFileName | null = null;
  private fileLines: string[] = [];
  private fenced = false;

  push(chunk: string): ParsedPiece[] {
    this.buffer += chunk;
    const pieces: ParsedPiece[] = [];
    let newline: number;
    while ((newline = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);
      pieces.push(...this.consumeLine(line, true));
    }
    return pieces;
  }

  finish(): ParsedPiece[] {
    const pieces: ParsedPiece[] = [];
    if (this.buffer.length > 0) pieces.push(...this.consumeLine(this.buffer, false));
    this.buffer = "";
    if (this.currentFile) pieces.push(this.closeFile());
    return pieces;
  }

  private closeFile(): ParsedPiece {
    const piece: ParsedPiece = { kind: "file", name: this.currentFile!, content: this.fileLines.join("\n") };
    this.currentFile = null;
    this.fileLines = [];
    this.fenced = false;
    return piece;
  }

  private consumeLine(line: string, hadNewline: boolean): ParsedPiece[] {
    const content = line.replace(/\r$/, "");
    const marker = content.trim();
    const start = marker.match(FILE_START);

    // Some models wrap the custom protocol in a Markdown HTML fence.
    if (start && isSiteFileName(start[1]) && (!this.currentFile || (this.fenced && this.fileLines.length === 0))) {
      this.currentFile = start[1];
      this.fileLines = [];
      this.fenced = false;
      return [{ kind: "file_start", name: start[1] }];
    }

    if (this.currentFile) {
      if (FILE_END.test(marker) || (this.fenced && /^```\s*$/.test(marker))) return [this.closeFile()];
      this.fileLines.push(content);
      return [];
    }

    const fence = marker.match(/^```\s*([\w.-]*)\s*$/);
    if (fence) {
      const name = FENCE_FILES[fence[1].toLowerCase()];
      if (name) {
        this.currentFile = name;
        this.fenced = true;
        return [{ kind: "file_start", name }];
      }
      return [];
    }
    return content.length > 0 || hadNewline ? [{ kind: "text", text: hadNewline ? `${content}\n` : content }] : [];
  }
}
