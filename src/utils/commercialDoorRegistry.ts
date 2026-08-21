export interface CommercialDoorFormulaParams {
  width: number;
  height: number;
  qty: number;
}

export interface CutResult {
  value: number;
  label: string;
}

export interface CommercialDoorCuts {
  lateral: CutResult;
  dintel: CutResult;
  jamba: CutResult;
  ruleta: CutResult;
  vidrio: {
    valueWidth: number;
    valueHeight: number;
    labelWidth: string;
    labelHeight: string;
  };
}

export interface CommercialDoorSystem {
  name: string;
  calculate: (width: number, height: number, qty: number) => CommercialDoorCuts;
}

export const commercialDoorProfiles: Record<string, CommercialDoorSystem> = {
  "Puerta Comercial": {
    name: "Puerta Comercial",
    calculate: (w, h, qty) => {
      // Lateral: Alto - 1/4"
      const lateralVal = +(h - 0.25).toFixed(4);
      const latLabel = `(${2 * qty})`;

      // Dintel: Ancho - 3 3/4"
      const dintelVal = +(w - 3.75).toFixed(4);
      const dintelLabel = `(${1 * qty})`;

      // Jamba: Alto - 2 7/8"
      const jambaVal = +(h - 2.875).toFixed(4);
      const jambaLabel = `(${2 * qty})`;

      // Ruleta: Ancho - 8 1/8"
      const ruletaVal = +(w - 8.125).toFixed(4);
      const ruletaLabel = `(${2 * qty})`;

      // Cristal: Ancho - 12 1/8", Alto - 8 7/8"
      const glassW = +(w - 12.125).toFixed(4);
      const glassH = +(h - 8.875).toFixed(4);
      const glassLabelW = `(${1 * qty})`;
      const glassLabelH = `(${1 * qty})`;

      return {
        lateral: { value: lateralVal, label: latLabel },
        dintel: { value: dintelVal, label: dintelLabel },
        jamba: { value: jambaVal, label: jambaLabel },
        ruleta: { value: ruletaVal, label: ruletaLabel },
        vidrio: { 
          valueWidth: glassW, 
          valueHeight: glassH, 
          labelWidth: glassLabelW, 
          labelHeight: glassLabelH 
        },
      };
    }
  }
};
