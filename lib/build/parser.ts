import { FILE_END, FILE_START, isSiteFileName, type SiteFileName } from "@/lib/build/types";

/**
 * Incremental parser for the model's output format:
 *
 *   free text (shown to the user)
 *   <<<FILE index.html>>>
 *   ...file content...
 *   <<<END>>>
 *
 * Feed chunks as they stream; it emits text pieces as soon as they are known
 * not to be part of a marker, and whole files as each block closes. Markers
 * are matched per line so a partial marker at the end of a chunk is held
 * back until the newline arrives.
 */

export type ParsedPiece =
  | { kind: "text"; text: string }
  | { kind: "file_start"; name: SiteFileName }
  | { kind: "file"; name: SiteFileName; content: string };

export class BuildOutputParser {
  private buffer = "";
  private currentFile: SiteFileName | null = null;
  private fileLines: string[] = [];

  push(chunk: string): ParsedPiece[] {
    this.buffer += chunk;
    const pieces: ParsedPiece[] = [];

    let newline: number;
    while ((newline = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);
      pieces.push(...this.consumeLine(line, true));
    }

    // Outside a file block, text that cannot be the start of a marker can be
    // released immediately so the chat feels live.
    if (!this.currentFile && this.buffer.length > 0 && !"<<<FILE".startsWith(this.buffer.slice(0, 7)) && !this.buffer.startsWith("<")) {
      pieces.push({ kind: "text", text: this.buffer });
      this.buffer = "";
    }

    return pieces;
  }

  /** Flush whatever is left at end of stream. */
  finish(): ParsedPiece[] {
    const pieces: ParsedPiece[] = [];
    if (this.buffer.length > 0) {
      pieces.push(...this.consumeLine(this.buffer, false));
      this.buffer = "";
    }
    if (this.currentFile) {
      // Unterminated block: keep what we have rather than dropping the file.
      pieces.push({ kind: "file", name: this.currentFile, content: this.fileLines.join("\n") });
      this.currentFile = null;
      this.fileLines = [];
    }
    return pieces;
  }

  private consumeLine(line: string, hadNewline: boolean): ParsedPiece[] {
    const trimmed = line.replace(/\r$/, "");

    if (this.currentFile) {
      if (FILE_END.test(trimmed)) {
        const piece: ParsedPiece = { kind: "file", name: this.currentFile, content: this.fileLines.join("\n") };
        this.currentFile = null;
        this.fileLines = [];
        return [piece];
      }
      this.fileLines.push(trimmed);
      return [];
    }

    const start = trimmed.match(FILE_START);
    if (start) {
      const name = start[1];
      if (isSiteFileName(name)) {
        this.currentFile = name;
        this.fileLines = [];
        return [{ kind: "file_start", name }];
      }
      // Unknown file name: treat the marker as text so nothing disappears.
    }

    // Strip stray code fences the model might add around the whole answer.
    if (/^```/.test(trimmed)) return [];
    return trimmed.length > 0 || hadNewline ? [{ kind: "text", text: hadNewline ? `${trimmed}\n` : trimmed }] : [];
  }
}
