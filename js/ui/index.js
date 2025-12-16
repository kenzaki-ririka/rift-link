// Preact + htm 入口
import { h, render } from 'https://esm.sh/preact@10.19.3';
import { useState, useEffect, useCallback } from 'https://esm.sh/preact@10.19.3/hooks';
import htm from 'https://esm.sh/htm@3.1.1';

// 绑定 htm 到 Preact
export const html = htm.bind(h);

// 导出 Preact hooks
export { useState, useEffect, useCallback, render };

// 导出 h 函数（用于自定义渲染）
export { h };

