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

  // Sort by max dimension descending, then by area descending
  expandedPieces.sort((a, b) => {
    const maxA = Math.max(a.width, a.height);
    const maxB = Math.max(b.width, b.height);
    if (maxB !== maxA) return maxB - maxA;
    return (b.width * b.height) - (a.width * a.height);
  });

  const sheets: SheetResult[] = [];
  const unplaced: GlassPiece[] = [];

  // Track free rectangles for each sheet
  interface FreeRect {
    x: number;
    y: number;
    w: number;
    h: number;
  }
  const sheetFreeRects: FreeRect[][] = [];

  expandedPieces.forEach(piece => {
    const pw = piece.width;
    const ph = piece.height;

    let bestSheetIdx = -1;
    let bestFreeRectIdx = -1;
    let bestRotated = false;
    let bestScore = Infinity;

    // Find the best fit across all existing sheets and their free rectangles
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

      // First-fit sheet heuristic: if we found a fit in this sheet, don't look at later sheets
      if (bestSheetIdx !== -1) {
        break;
      }
    }

    if (bestSheetIdx !== -1) {
      // Place in existing sheet
      const sheet = sheets[bestSheetIdx];
      const freeRects = sheetFreeRects[bestSheetIdx];
      const F = freeRects[bestFreeRectIdx];

      // Remove the chosen free rect
      freeRects.splice(bestFreeRectIdx, 1);

      // Width and height of the placed piece
      const w = bestRotated ? ph : pw;
      const h = bestRotated ? pw : ph;

      // Add to placed pieces
      sheet.placed.push({
        ...piece,
        x: F.x,
        y: F.y,
        rotated: bestRotated
      });

      // Split the free rect
      const remW = F.w - w;
      const remH = F.h - h;

      // Guillotine split: Shorter Axis Split Rule (SAS)
      const splitHorizontal = remW > remH;

      if (splitHorizontal) {
        // Horizontal cut: split horizontally first
        const rTop = {
          x: F.x,
          y: F.y + h + bladeWidth,
          w: F.w,
          h: F.h - h - bladeWidth
        };
        const rRight = {
          x: F.x + w + bladeWidth,
          y: F.y,
          w: F.w - w - bladeWidth,
          h: h
        };
        if (rTop.w > 0 && rTop.h > 0) freeRects.push(rTop);
        if (rRight.w > 0 && rRight.h > 0) freeRects.push(rRight);
      } else {
        // Vertical cut: split vertically first
        const rRight = {
          x: F.x + w + bladeWidth,
          y: F.y,
          w: F.w - w - bladeWidth,
          h: F.h
        };
        const rTop = {
          x: F.x,
          y: F.y + h + bladeWidth,
          w: w,
          h: F.h - h - bladeWidth
        };
        if (rRight.w > 0 && rRight.h > 0) freeRects.push(rRight);
        if (rTop.w > 0 && rTop.h > 0) freeRects.push(rTop);
      }
    } else {
      // Try to open a new sheet
      const fitsNormal = pw <= sheetWidth && ph <= sheetHeight;
      const fitsRotated = ph <= sheetWidth && pw <= sheetHeight;

      if (fitsNormal || fitsRotated) {
        // Choose orientation that minimizes width or just fits
        let rotate = false;
        if (fitsNormal && fitsRotated) {
          rotate = ph < pw; // prefer orientation where physical width is smaller
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

        // Initial free rects for new sheet after placing the first piece
        const freeRects: FreeRect[] = [];
        const remW = sheetWidth - w;
        const remH = sheetHeight - h;

        const splitHorizontal = remW > remH;

        if (splitHorizontal) {
          const rTop = {
            x: 0,
            y: h + bladeWidth,
            w: sheetWidth,
            h: sheetHeight - h - bladeWidth
          };
          const rRight = {
            x: w + bladeWidth,
            y: 0,
            w: sheetWidth - w - bladeWidth,
            h: h
          };
          if (rTop.w > 0 && rTop.h > 0) freeRects.push(rTop);
          if (rRight.w > 0 && rRight.h > 0) freeRects.push(rRight);
        } else {
          const rRight = {
            x: w + bladeWidth,
            y: 0,
            w: sheetWidth - w - bladeWidth,
            h: sheetHeight
          };
          const rTop = {
            x: 0,
            y: h + bladeWidth,
            w: w,
            h: sheetHeight - h - bladeWidth
          };
          if (rRight.w > 0 && rRight.h > 0) freeRects.push(rRight);
          if (rTop.w > 0 && rTop.h > 0) freeRects.push(rTop);
        }

        sheetFreeRects.push(freeRects);
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
