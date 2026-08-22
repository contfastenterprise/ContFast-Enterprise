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
  calculate: (width: number, height: number, qty: number, hojas?: number) => CommercialDoorCuts;
}

export const commercialDoorProfiles: Record<string, CommercialDoorSystem> = {
  "Puerta Comercial": {
    name: "Puerta Comercial",
    calculate: (w, h, qty, hojas = 1) => {
      // Lateral: Alto - 1/4" (Marco Hueco)
      const lateralVal = +(h - 0.25).toFixed(4);
      const latLabel = `(${2 * qty})`;

      // Dintel: Ancho - 3 3/4" (Marco Hueco)
      const dintelVal = +(w - 3.75).toFixed(4);
      const dintelLabel = `(${1 * qty})`;

      // Jamba: Alto - 2 7/8"
      const jambaVal = +(h - 2.875).toFixed(4);
      const jambaLabel = `(${2 * hojas * qty})`;

      // Ruleta and Cristal calculation
      let ruletaVal, glassW;
      if (hojas === 2) {
        // Para 2 hojas:
        // El ancho de la ruleta = (Ancho - 11 5/8) / 2
        // Cristal W = (Ancho - 19 5/8) / 2
        ruletaVal = +((w - 11.625) / 2).toFixed(4);
        glassW = +((w - 19.625) / 2).toFixed(4);
      } else {
        // Para 1 hoja:
        // Ruleta: Ancho - 8 1/8"
        ruletaVal = +(w - 8.125).toFixed(4);
        // Cristal W: Ancho - 12 1/8"
        glassW = +(w - 12.125).toFixed(4);
      }
      
      const ruletaLabel = `(${2 * hojas * qty})`;
      const glassLabelW = `(${1 * hojas * qty})`;

      // Cristal Alto (H-Cristal): Alto - 8 7/8"
      const glassH = +(h - 8.875).toFixed(4);
      const glassLabelH = `(${1 * hojas * qty})`;

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
