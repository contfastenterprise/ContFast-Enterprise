export interface GlassPiece {
  id: string;
  width: number;
  height: number;
  quantity: number;
  label: string;
  color?: string;
}

export interface PlacedPiece extends GlassPiece {
  x: number;
  y: number;
  rotated: boolean;
}

export interface SheetResult {
  id: number;
  placed: PlacedPiece[];
  wastePercent: number;
  usedArea: number;
}

export interface OptimizationResult {
  sheets: SheetResult[];
  unplaced: GlassPiece[];
  totalUsedArea: number;
  totalSheets: number;
}

interface FreeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function optimizeGlassCutting(
  pieces: GlassPiece[],
  sheetWidth: number,
  sheetHeight: number,
  bladeWidth: number
): OptimizationResult {
  const expandedPieces: GlassPiece[] = [];
  pieces.forEach(p => {
    for (let i = 0; i < p.quantity; i++) {
      expandedPieces.push({ ...p, id: `${p.id}-${i}` });
    }
  });

  // Sort by area descending, then by max dimension descending to minimize waste (First-Fit Decreasing Area)
  expandedPieces.sort((a, b) => {
    const areaA = a.width * a.height;
    const areaB = b.width * b.height;
    if (areaB !== areaA) return areaB - areaA;
    const maxA = Math.max(a.width, a.height);
    const maxB = Math.max(b.width, b.height);
    return maxB - maxA;
  });

  const sheets: SheetResult[] = [];
  const unplaced: GlassPiece[] = [];
  const sheetFreeRects: FreeRect[][] = [];

  function cleanFreeRects(freeRects: FreeRect[]): FreeRect[] {
    const result: FreeRect[] = [];
    for (let i = 0; i < freeRects.length; i++) {
      const F1 = freeRects[i];
      if (F1.w <= 0 || F1.h <= 0) continue;
      
      let contained = false;
      for (let j = 0; j < freeRects.length; j++) {
        if (i === j) continue;
        const F2 = freeRects[j];
        if (
          F1.x >= F2.x &&
          F1.y >= F2.y &&
          F1.x + F1.w <= F2.x + F2.w &&
          F1.y + F1.h <= F2.y + F2.h
        ) {
          contained = true;
          break;
        }
      }
      if (!contained) {
        result.push(F1);
      }
    }
    return result;
  }

  expandedPieces.forEach(piece => {
    const pw = piece.width;
    const ph = piece.height;

    let bestSheetIdx = -1;
    let bestFreeRectIdx = -1;
    let bestRotated = false;
    let bestScore = Infinity;

    // Search existing sheets starting from Sheet 1 (index 0)
    for (let sIdx = 0; sIdx < sheets.length; sIdx++) {
      const freeRects = sheetFreeRects[sIdx];
      for (let fIdx = 0; fIdx < freeRects.length; fIdx++) {
        const F = freeRects[fIdx];

        // Check normal
        if (pw <= F.w && ph <= F.h) {
          const remW = F.w - pw;
          const remH = F.h - ph;
          const score = Math.min(remW, remH);
          if (score < bestScore) {
            bestScore = score;
            bestSheetIdx = sIdx;
            bestFreeRectIdx = fIdx;
            bestRotated = false;
          }
        }

        // Check rotated
        if (ph <= F.w && pw <= F.h) {
          const remW = F.w - ph;
          const remH = F.h - pw;
          const score = Math.min(remW, remH);
          if (score < bestScore) {
            bestScore = score;
            bestSheetIdx = sIdx;
            bestFreeRectIdx = fIdx;
            bestRotated = true;
          }
        }
      }

      // First-fit sheet: if it fits on this sheet, we do NOT open/search later sheets.
      // This guarantees that we place in the earliest possible sheet.
      if (bestSheetIdx !== -1) {
        break;
      }
    }

    if (bestSheetIdx !== -1) {
      // Place piece in the selected sheet
      const sheet = sheets[bestSheetIdx];
      const freeRects = sheetFreeRects[bestSheetIdx];
      const chosenRect = freeRects[bestFreeRectIdx];

      // Placed piece coordinates and dimensions
      const px = chosenRect.x;
      const py = chosenRect.y;
      const w = bestRotated ? ph : pw;
      const h = bestRotated ? pw : ph;

      // Add to placed list
      sheet.placed.push({
        ...piece,
        x: px,
        y: py,
        rotated: bestRotated
      });

      // Split all free rectangles in this sheet that intersect the new piece
      const newFreeRects: FreeRect[] = [];
      const P = { x: px, y: py, w, h };

      freeRects.forEach(F => {
        // Intersection check
        const intersects = P.x < F.x + F.w && P.x + P.w > F.x && P.y < F.y + F.h && P.y + P.h > F.y;
        if (intersects) {
          // Left remnant
          if (P.x > F.x) {
            newFreeRects.push({
              x: F.x,
              y: F.y,
              w: P.x - F.x - bladeWidth,
              h: F.h
            });
          }
          // Right remnant
          if (P.x + P.w < F.x + F.w) {
            newFreeRects.push({
              x: P.x + P.w + bladeWidth,
              y: F.y,
              w: F.x + F.w - (P.x + P.w + bladeWidth),
              h: F.h
            });
          }
          // Bottom remnant
          if (P.y > F.y) {
            newFreeRects.push({
              x: F.x,
              y: F.y,
              w: F.w,
              h: P.y - F.y - bladeWidth
            });
          }
          // Top remnant
          if (P.y + P.h < F.y + F.h) {
            newFreeRects.push({
              x: F.x,
              y: P.y + P.h + bladeWidth,
              w: F.w,
              h: F.y + F.h - (P.y + P.h + bladeWidth)
            });
          }
        } else {
          // Keep as is
          newFreeRects.push(F);
        }
      });

      sheetFreeRects[bestSheetIdx] = cleanFreeRects(newFreeRects);

    } else {
      // Piece did not fit in any existing sheet. Check if it fits in a brand new sheet.
      const fitsNormal = pw <= sheetWidth && ph <= sheetHeight;
      const fitsRotated = ph <= sheetWidth && pw <= sheetHeight;

      if (fitsNormal || fitsRotated) {
        let rotate = false;
        if (fitsNormal && fitsRotated) {
          rotate = ph < pw; // Prefer orientation where physical width is smaller
        } else {
          rotate = !fitsNormal && fitsRotated;
        }

        const w = rotate ? ph : pw;
        const h = rotate ? pw : ph;

        const newSheet: SheetResult = {
          id: sheets.length + 1,
          placed: [{
            ...piece,
            x: 0,
            y: 0,
            rotated: rotate
          }],
          wastePercent: 0,
          usedArea: 0
        };

        sheets.push(newSheet);

        // Initial free rectangles after placing first piece on a new sheet
        const freeRects: FreeRect[] = [];
        
        // Right remnant
        if (w < sheetWidth) {
          freeRects.push({
            x: w + bladeWidth,
            y: 0,
            w: sheetWidth - w - bladeWidth,
            h: sheetHeight
          });
        }
        // Top remnant
        if (h < sheetHeight) {
          freeRects.push({
            x: 0,
            y: h + bladeWidth,
            w: sheetWidth,
            h: sheetHeight - h - bladeWidth
          });
        }

        sheetFreeRects.push(cleanFreeRects(freeRects));
      } else {
        unplaced.push(piece);
      }
    }
  });

  // Finalize stats
  const totalSheetArea = sheetWidth * sheetHeight;
  sheets.forEach(s => {
    const used = s.placed.reduce((acc, p) => acc + (p.width * p.height), 0);
    s.usedArea = used;
    s.wastePercent = totalSheetArea > 0 ? 100 - ((used / totalSheetArea) * 100) : 100;
  });

  return {
    sheets,
    unplaced,
    totalUsedArea: sheets.reduce((acc, s) => acc + s.usedArea, 0),
    totalSheets: sheets.length
  };
}
