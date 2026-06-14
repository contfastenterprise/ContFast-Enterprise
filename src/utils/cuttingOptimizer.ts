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

  // Sort by Height mainly, but try to keep them together (Best-Fit Height)
  expandedPieces.sort((a, b) => {
    const maxH_A = Math.max(a.width, a.height);
    const maxH_B = Math.max(b.width, b.height);
    if (maxH_B !== maxH_A) return maxH_B - maxH_A;
    return (b.width * b.height) - (a.width * a.height);
  });

  const sheets: SheetResult[] = [];
  const unplaced: GlassPiece[] = [];

  // Tracking for each sheet: { columns: { x, width, usedHeight }[] }
  const sheetTracker: {
    columns: { x: number; width: number; usedHeight: number }[]
  }[] = [];

  expandedPieces.forEach(piece => {
    let placed = false;

    // Try to find the BEST fit across all existing columns (Best-Fit Height)
    let bestSheetIdx = -1;
    let bestColIdx = -1;
    let bestRotate = false;
    let minRemainingHeight = Infinity;

    for (let sIdx = 0; sIdx < sheets.length; sIdx++) {
      const tracker = sheetTracker[sIdx];
      for (let cIdx = 0; cIdx < tracker.columns.length; cIdx++) {
        const col = tracker.columns[cIdx];

        // Try Normal (Width is fixed for this column)
        if (piece.width <= col.width && col.usedHeight + piece.height + bladeWidth <= sheetHeight) {
          const rem = sheetHeight - (col.usedHeight + piece.height + bladeWidth);
          if (rem < minRemainingHeight) {
            minRemainingHeight = rem;
            bestSheetIdx = sIdx;
            bestColIdx = cIdx;
            bestRotate = false;
          }
        }
        // Try Rotated
        if (piece.height <= col.width && col.usedHeight + piece.width + bladeWidth <= sheetHeight) {
          const rem = sheetHeight - (col.usedHeight + piece.width + bladeWidth);
          if (rem < minRemainingHeight) {
            minRemainingHeight = rem;
            bestSheetIdx = sIdx;
            bestColIdx = cIdx;
            bestRotate = true;
          }
        }
      }
    }

    // 1. If found a column, place it
    if (bestSheetIdx !== -1) {
      const sheet = sheets[bestSheetIdx];
      const col = sheetTracker[bestSheetIdx].columns[bestColIdx];
      sheet.placed.push({
        ...piece,
        x: col.x,
        y: col.usedHeight,
        rotated: bestRotate
      });
      col.usedHeight += (bestRotate ? piece.width : piece.height) + bladeWidth;
      placed = true;
    }

    // 2. If no existing column fits, try to create a new column in existing sheets
    if (!placed) {
      for (let sIdx = 0; sIdx < sheets.length; sIdx++) {
        const tracker = sheetTracker[sIdx];
        const lastCol = tracker.columns[tracker.columns.length - 1];
        const nextX = lastCol ? (lastCol.x + lastCol.width + bladeWidth) : 0;

        // Prioritize orientation that makes the column THINNER (saves width for remnants)
        const fitsNormal = nextX + piece.width <= sheetWidth && piece.height <= sheetHeight;
        const fitsRotated = nextX + piece.height <= sheetWidth && piece.width <= sheetHeight;

        if (fitsNormal || fitsRotated) {
          let rotate = false;
          if (fitsNormal && fitsRotated) {
            // Choose the one that uses less width
            rotate = piece.height < piece.width;
          } else {
            rotate = !fitsNormal && fitsRotated;
          }

          const colW = rotate ? piece.height : piece.width;
          const colH = (rotate ? piece.width : piece.height) + bladeWidth;

          tracker.columns.push({ x: nextX, width: colW, usedHeight: colH });
          sheets[sIdx].placed.push({
            ...piece,
            x: nextX,
            y: 0,
            rotated: rotate
          });
          placed = true;
          break;
        }
      }
    }

    // 3. Create a NEW sheet if still not placed
    if (!placed) {
      const fitsAtAllNormal = piece.width <= sheetWidth && piece.height <= sheetHeight;
      const fitsAtAllRotated = piece.height <= sheetWidth && piece.width <= sheetHeight;

      if (fitsAtAllNormal || fitsAtAllRotated) {
        let rotate = false;
        if (fitsAtAllNormal && fitsAtAllRotated) {
          rotate = piece.height < piece.width; // Use thinner width
        } else {
          rotate = !fitsAtAllNormal && fitsAtAllRotated;
        }

        const colW = rotate ? piece.height : piece.width;
        const colH = (rotate ? piece.width : piece.height) + bladeWidth;

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
        sheetTracker.push({
          columns: [{ x: 0, width: colW, usedHeight: colH }]
        });
        placed = true;
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
