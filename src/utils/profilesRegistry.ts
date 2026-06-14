export interface WindowFormulaParams {
  width: number;
  height: number;
  qty: number;
}

export interface CutResult {
  value: number;
  label: string;
}

export interface SystemCuts {
  cabezal: CutResult;
  llavin: CutResult;
  riel: CutResult;
  lateral: CutResult;
  vidrio: {
    valueWidth: number;
    valueHeight: number;
    label: string;
  };
}

export interface ProfileSystem {
  name: string;
  calculate: (width: number, height: number, qty: number, vias: number) => SystemCuts;
}

export const windowProfiles: Record<string, ProfileSystem> = {
  "Tradicional": {
    name: "Tradicional",
    calculate: (w, h, qty, vias) => {
      let cabezalVal = 0, llavinVal = 0, rielVal = 0, lateralVal = 0;
      let glassW = 0, glassH = 0;
      let cabLabel = "-", llavLabel = "-", rielLabel = "-", latLabel = "-", glassLabel = "-";

      if (vias === 2) {
        cabezalVal = parseFloat(((w - 0.5) / 2).toFixed(4));
        llavinVal = +(h - 0.875).toFixed(4);
        rielVal = +(w - 0.25).toFixed(4);
        lateralVal = +(h - 0.5).toFixed(4);
        glassW = parseFloat(((w - 4) / 2).toFixed(4));
        glassH = +(h - 4).toFixed(4);

        cabLabel = `(${2 * qty})(${2 * qty})`;
        llavLabel = `(${2 * qty})(${2 * qty})`;
        rielLabel = `(${qty})(${qty})`;
        latLabel = `(${2 * qty})`;
        glassLabel = `(${2 * qty})`;
      } else if (vias === 3) {
        cabezalVal = parseFloat(((w + 0.375) / 3).toFixed(4));
        llavinVal = +(h - 0.875).toFixed(4);
        rielVal = +(w - 0.25).toFixed(4);
        lateralVal = +(h - 0.5).toFixed(4);
        glassW = +(cabezalVal - 1.75).toFixed(4);
        glassH = +(h - 4).toFixed(4);

        cabLabel = `(${3 * qty})(${3 * qty})`;
        llavLabel = `(${2 * qty})(${4 * qty})`;
        rielLabel = `(${qty})(${qty})`;
        latLabel = `(${2 * qty})`;
        // Special glass label for 3 vias since it has mixed sizes
        glassLabel = `(${2 * qty}) [W] * [H] y (${1 * qty}) [W+5/8] * [H]`;
      } else if (vias === 4) {
        cabezalVal = parseFloat(((w - 0.5) / 4).toFixed(4));
        llavinVal = +(h - 0.875).toFixed(4);
        rielVal = +(w - 0.25).toFixed(4);
        lateralVal = +(h - 0.5).toFixed(4);
        glassW = parseFloat(((w - 8) / 4).toFixed(4));
        glassH = +(h - 4).toFixed(4);

        cabLabel = `(${4 * qty})(${4 * qty})`;
        llavLabel = `(${4 * qty})(${4 * qty})`;
        rielLabel = `(${qty})`;
        latLabel = `(${2 * qty})`;
        glassLabel = `(${4 * qty})`;
      }

      return {
        cabezal: { value: cabezalVal, label: cabLabel },
        llavin: { value: llavinVal, label: llavLabel },
        riel: { value: rielVal, label: rielLabel },
        lateral: { value: lateralVal, label: latLabel },
        vidrio: { valueWidth: glassW, valueHeight: glassH, label: glassLabel },
      };
    }
  },
  "P-65": {
    name: "P-65",
    calculate: (w, h, qty, vias) => {
      let cabezalVal = 0, llavinVal = 0, rielVal = 0, lateralVal = 0;
      let glassW = 0, glassH = 0;
      let cabLabel = "-", llavLabel = "-", rielLabel = "-", latLabel = "-", glassLabel = "-";

      if (vias === 2) {
        cabezalVal = parseFloat(((w - 1.25) / 2).toFixed(4));
        llavinVal = +(h - 2).toFixed(4);
        rielVal = +(w - 1.5).toFixed(4);
        lateralVal = +(h - 0.125).toFixed(4);
        glassW = +(cabezalVal - 2.5625).toFixed(4);
        glassH = +(h - 5).toFixed(4);

        cabLabel = `(${4 * qty})`;
        llavLabel = `(${2 * qty})(${2 * qty})`;
        rielLabel = `(${qty})(${qty})`;
        latLabel = `(${2 * qty})`;
        glassLabel = `(${2 * qty})`;
      } else if (vias === 3) {
        cabezalVal = parseFloat(((w + 0.1875) / 3).toFixed(4));
        llavinVal = +(h - 2).toFixed(4);
        rielVal = +(w - 1.5).toFixed(4);
        lateralVal = +(h - 0.125).toFixed(4);
        glassW = +(cabezalVal - 2.5625).toFixed(4);
        glassH = +(h - 5).toFixed(4);

        cabLabel = `(${6 * qty})`;
        llavLabel = `(${2 * qty})(${4 * qty})`;
        rielLabel = `(${qty})(${qty})`;
        latLabel = `(${2 * qty})`;
        glassLabel = `(${2 * qty}) [W] * [H] y (${1 * qty}) [W-1/4] * [H]`;
      }

      return {
        cabezal: { value: cabezalVal, label: cabLabel },
        llavin: { value: llavinVal, label: llavLabel },
        riel: { value: rielVal, label: rielLabel },
        lateral: { value: lateralVal, label: latLabel },
        vidrio: { valueWidth: glassW, valueHeight: glassH, label: glassLabel },
      };
    }
  },
  "P-92": {
    name: "P-92",
    calculate: (w, h, qty, vias) => {
      let cabezalVal = 0, llavinVal = 0, rielVal = 0, lateralVal = 0;
      let glassW = 0, glassH = 0;
      let cabLabel = "-", llavLabel = "-", rielLabel = "-", latLabel = "-", glassLabel = "-";

      if (vias === 2) {
        cabezalVal = parseFloat(((w - 0.875) / 2).toFixed(4));
        llavinVal = +(h - 2.5).toFixed(4);
        rielVal = +(w - 1.625).toFixed(4);
        lateralVal = +(h - 0.125).toFixed(4);
        glassW = +(cabezalVal - 3.25).toFixed(4);
        glassH = +(h - 6.5).toFixed(4);

        cabLabel = `(${4 * qty})`;
        llavLabel = `(${2 * qty})(${2 * qty})`;
        rielLabel = `(${qty})(${qty})`;
        latLabel = `(${2 * qty})`;
        glassLabel = `(${2 * qty})`;
      } else if (vias === 3) {
        cabezalVal = parseFloat(((w + 1.25) / 3).toFixed(4));
        llavinVal = +(h - 2.5).toFixed(4);
        rielVal = +(w - 1.625).toFixed(4);
        lateralVal = +(h - 0.125).toFixed(4);
        glassW = +(cabezalVal - 3.25).toFixed(4);
        glassH = +(h - 6.5).toFixed(4);

        cabLabel = `(${6 * qty})`;
        llavLabel = `(${2 * qty})(${4 * qty})`;
        rielLabel = `(${qty})(${qty})`;
        latLabel = `(${2 * qty})`;
        glassLabel = `(${2 * qty}) [W] * [H] y (${1 * qty}) [W-3/8] * [H]`;
      } else if (vias === 4) {
        cabezalVal = parseFloat(((w - 0.5) / 4).toFixed(4));
        llavinVal = +(h - 2.5).toFixed(4);
        rielVal = +(w - 1.625).toFixed(4);
        lateralVal = +(h - 0.125).toFixed(4);
        glassW = +(cabezalVal - 3.25).toFixed(4);
        glassH = +(h - 6.5).toFixed(4);

        cabLabel = `(${8 * qty})`;
        llavLabel = `(${4 * qty})(${4 * qty})`;
        rielLabel = `(${qty})(${qty})`;
        lateralVal = +(h - 0.125).toFixed(4);
        latLabel = `(${2 * qty})`;
        glassLabel = `(${4 * qty})`;
      }

      return {
        cabezal: { value: cabezalVal, label: cabLabel },
        llavin: { value: llavinVal, label: llavLabel },
        riel: { value: rielVal, label: rielLabel },
        lateral: { value: lateralVal, label: latLabel },
        vidrio: { valueWidth: glassW, valueHeight: glassH, label: glassLabel },
      };
    }
  }
};
