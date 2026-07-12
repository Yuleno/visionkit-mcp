/** 仅处理会伪装成测量结果的模型输出，不替代视觉结论。 */
export function guardUiDiffMeasurements(text: string): { text: string; warnings: string[] } {
  let replacements = 0;
  const guarded = text
    .replace(/#[0-9a-f]{3,8}\b/gi, () => {
      replacements += 1;
      return "（具体色值无法从截图精确测量）";
    })
    .replace(/\b\d+(?:\.\d+)?\s*(?:px|rem|em)\b/gi, () => {
      replacements += 1;
      return "（具体尺寸无法从截图精确测量）";
    });
  return {
    text: guarded,
    warnings: replacements > 0 ? [`UI diff 已移除 ${replacements} 个未经测量的精确样式数值`] : [],
  };
}
