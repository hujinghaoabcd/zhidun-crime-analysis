'use strict';

/**
 * 轻量流式 CSV 解析器（支持引号包裹、字段内换行、"" 转义）
 * 按块处理，避免逐字节分配。
 */

class CsvParser {
  constructor(opts = {}) {
    this.onRow = opts.onRow || (() => {});
    this.onEnd = opts.onEnd || (() => {});
    this.header = opts.header !== false;
    this.buf = Buffer.alloc(0);
    this.row = [];
    this.parts = [];
    this.inQuotes = false;
    this.rowCount = 0;
    this._headerRow = null;
  }

  write(chunk) {
    if (this.buf.length) {
      this.buf = Buffer.concat([this.buf, chunk]);
    } else {
      this.buf = chunk;
    }
    const buf = this.buf;
    const len = buf.length;
    let i = 0;
    let fieldStart = 0;
    let keepFrom = 0;

    while (i < len) {
      const c = buf[i];
      if (this.inQuotes) {
        if (c === 0x22) {
          if (i + 1 < len && buf[i + 1] === 0x22) {
            if (i > fieldStart) this.parts.push(buf.slice(fieldStart, i));
            this.parts.push(Buffer.from([0x22]));
            i += 2;
            fieldStart = i;
            continue;
          }
          if (i + 1 >= len) {
            // 引号可能在下一个 chunk 才闭合，保留当前位置
            if (i > fieldStart) this.parts.push(buf.slice(fieldStart, i));
            keepFrom = i;
            i = len;
            break;
          }
          this.inQuotes = false;
          i += 1;
          continue;
        }
        i += 1;
        continue;
      }
      if (c === 0x22 && i === fieldStart) {
        this.inQuotes = true;
        fieldStart = i + 1;
        i += 1;
        continue;
      }
      if (c === 0x2c || c === 0x0a) {
        if (i > fieldStart) this.parts.push(buf.slice(fieldStart, i));
        this.row.push(this.parts.length ? Buffer.concat(this.parts) : Buffer.alloc(0));
        this.parts = [];
        if (c === 0x0a) this._emitRow();
        i += 1;
        fieldStart = i;
        continue;
      }
      if (c === 0x0d) {
        i += 1;
        continue;
      }
      i += 1;
    }

    if (keepFrom === 0 && fieldStart < len) {
      this.parts.push(buf.slice(fieldStart, len));
    }
    this.buf = keepFrom > 0 ? buf.slice(keepFrom) : Buffer.alloc(0);
  }

  _emitRow() {
    const values = this.row.map((b) => b.toString('utf8'));
    this.row = [];
    this.rowCount += 1;
    if (this.header && this.rowCount === 1) {
      this._headerRow = values;
      return;
    }
    this.onRow(values, this._headerRow, this.rowCount - (this.header ? 1 : 0));
  }

  end() {
    if (this.parts.length || this.row.length || this.buf.length) {
      if (this.buf.length) this.parts.push(this.buf);
      this.row.push(this.parts.length ? Buffer.concat(this.parts) : Buffer.alloc(0));
      this.parts = [];
      this._emitRow();
    }
    this.onEnd();
  }
}

module.exports = { CsvParser };
