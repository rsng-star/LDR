const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'backend', 'public', 'index.html');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Update distance-floating-hud styling
const oldHudCss = /\.distance-floating-hud \{[\s\S]*?\.distance-floating-hud:active \{[\s\S]*?\}/;
const newHudCss = `.distance-floating-hud {
      position: absolute;
      top: calc(var(--safe-top) + 64px);
      left: 50%;
      transform: translateX(-50%);
      background: linear-gradient(135deg, rgba(15, 23, 42, 0.94) 0%, rgba(30, 41, 59, 0.9) 100%);
      backdrop-filter: blur(28px);
      -webkit-backdrop-filter: blur(28px);
      border: 1px solid rgba(56, 189, 248, 0.28);
      border-radius: 20px;
      padding: 10px 24px;
      z-index: 450;
      text-align: center;
      box-shadow: 0 16px 45px rgba(0, 0, 0, 0.7), 0 0 24px rgba(56, 189, 248, 0.15), inset 0 1px 1px rgba(255, 255, 255, 0.2);
      min-width: 195px;
      pointer-events: auto;
      cursor: pointer;
      transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .distance-floating-hud:active {
      transform: translateX(-50%) scale(0.96);
      box-shadow: 0 8px 25px rgba(0, 0, 0, 0.6), 0 0 16px rgba(56, 189, 248, 0.12);
    }`;

content = content.replace(oldHudCss, newHudCss);

// 2. Update tool-fab in map-tools-rail
const oldFabCss = /\.tool-fab \{[\s\S]*?\.tool-fab:active \{[\s\S]*?\}/;
const newFabCss = `.tool-fab {
      width: 46px;
      height: 46px;
      border-radius: 50%;
      background: rgba(15, 23, 42, 0.9);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.14);
      color: var(--text);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 19px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6), inset 0 1px 1px rgba(255, 255, 255, 0.2);
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .tool-fab:active {
      transform: scale(0.88);
      background: rgba(56, 189, 248, 0.25);
    }`;

content = content.replace(oldFabCss, newFabCss);

// 3. Update bottom-partner-sheet and sheet-btn-row
const oldSheetCss = /\.bottom-partner-sheet \{[\s\S]*?\.bottom-partner-sheet\.expanded \{[\s\S]*?\}/;
const newSheetCss = `.bottom-partner-sheet {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      background: rgba(15, 23, 42, 0.95);
      backdrop-filter: blur(32px);
      -webkit-backdrop-filter: blur(32px);
      border-top: 1px solid rgba(255, 255, 255, 0.12);
      border-top-left-radius: 28px;
      border-top-right-radius: 28px;
      padding: 10px 16px calc(var(--safe-bottom) + 12px) 16px;
      z-index: 500;
      box-shadow: 0 -20px 50px rgba(0, 0, 0, 0.75), inset 0 1px 1px rgba(255, 255, 255, 0.15);
      transition: max-height 0.38s cubic-bezier(0.16, 1, 0.3, 1), transform 0.2s ease;
      max-height: 165px;
      overflow: hidden;
    }

    .bottom-partner-sheet.expanded {
      max-height: 520px;
    }`;

content = content.replace(oldSheetCss, newSheetCss);

// 4. Update sheet-btn-row and buttons
const oldBtnRowCss = /\.sheet-btn-row \{[\s\S]*?\.btn-share \{[\s\S]*?\}/;
const newBtnRowCss = `.sheet-btn-row {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-top: 4px;
    }

    .sheet-btn-row .btn-action-sheet {
      flex: 1;
      padding: 11px 8px;
      border-radius: 14px;
      font-size: 11.5px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      cursor: pointer;
      border: none;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      white-space: nowrap;
      text-overflow: ellipsis;
      overflow: hidden;
    }

    .btn-action-sheet:active {
      transform: scale(0.94);
    }

    .btn-nav {
      background: linear-gradient(135deg, #0284C7 0%, #2563EB 100%);
      color: #fff;
      box-shadow: 0 4px 18px rgba(2, 132, 199, 0.45);
      border: 1px solid rgba(56, 189, 248, 0.3);
    }

    .btn-nav:active {
      box-shadow: 0 2px 10px rgba(2, 132, 199, 0.6);
    }

    .btn-poke {
      background: linear-gradient(135deg, rgba(244, 63, 94, 0.18) 0%, rgba(236, 72, 153, 0.25) 100%);
      color: #FDA4AF;
      border: 1px solid rgba(244, 63, 94, 0.45);
      box-shadow: 0 4px 18px rgba(244, 63, 94, 0.22);
    }

    .btn-poke:active {
      background: rgba(244, 63, 94, 0.35);
    }

    .btn-share {
      background: linear-gradient(135deg, rgba(30, 41, 59, 0.85) 0%, rgba(15, 23, 42, 0.9) 100%);
      color: #F8FAFC;
      border: 1px solid rgba(255, 255, 255, 0.12);
    }`;

content = content.replace(oldBtnRowCss, newBtnRowCss);

// 5. Update floating hearts animation with physics wobble
const oldHeartCss = /\.floating-heart \{[\s\S]*?@keyframes floatHeartUp \{[\s\S]*?\}/;
const newHeartCss = `.floating-heart {
      position: fixed;
      bottom: 60px;
      pointer-events: none;
      font-size: 34px;
      z-index: 9999;
      animation: floatHeartUp 2.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      filter: drop-shadow(0 6px 16px rgba(244, 63, 94, 0.65));
    }
    @keyframes floatHeartUp {
      0% { transform: translateY(0) scale(0.5) rotate(0deg); opacity: 0; }
      15% { opacity: 1; transform: translateY(-40px) scale(1.3) rotate(-10deg); }
      50% { transform: translateY(-180px) scale(1.1) rotate(12deg); }
      80% { opacity: 0.9; transform: translateY(-340px) scale(1.0) rotate(-6deg); }
      100% { transform: translateY(-480px) scale(0.8) rotate(15deg); opacity: 0; }
    }`;

content = content.replace(oldHeartCss, newHeartCss);

// 6. Update toast with dynamic island styling
const oldToastCss = /\.app-toast \{[\s\S]*?\.app-toast\.active \{[\s\S]*?\}/;
const newToastCss = `.app-toast {
      position: fixed;
      top: calc(var(--safe-top) + 16px);
      left: 50%;
      transform: translateX(-50%) translateY(-35px);
      background: rgba(15, 23, 42, 0.94);
      border: 1px solid rgba(56, 189, 248, 0.35);
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.8), inset 0 1px 1px rgba(255, 255, 255, 0.15);
      padding: 10px 20px;
      border-radius: 999px;
      color: #fff;
      font-size: 13px;
      font-weight: 700;
      z-index: 9999;
      opacity: 0;
      pointer-events: none;
      transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
      display: flex;
      align-items: center;
      gap: 8px;
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
    }
    .app-toast.active {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }`;

content = content.replace(oldToastCss, newToastCss);

// 7. Add responsive mobile drawer styling for modals
const mobileDrawerCss = `
    /* Responsive Mobile Sheet Drawer for Modals */
    @media (max-width: 640px) {
      .modal-overlay {
        justify-content: flex-end !important;
        padding: 0 !important;
      }
      .modal-card {
        border-bottom-left-radius: 0 !important;
        border-bottom-right-radius: 0 !important;
        border-top-left-radius: 28px !important;
        border-top-right-radius: 28px !important;
        max-width: 100% !important;
        width: 100% !important;
        border-bottom: none !important;
        padding: 20px 20px calc(var(--safe-bottom) + 18px) 20px !important;
        animation: modal-slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1) !important;
      }
      @keyframes modal-slide-up {
        from { transform: translateY(100%); }
        to { transform: translateY(0); }
      }
    }
  </style>`;

if (!content.includes('Responsive Mobile Sheet Drawer')) {
  content = content.replace('  </style>', mobileDrawerCss);
}

// 8. Update button class in HTML for btn-poke
content = content.replace(
  `class="btn-action-sheet btn-share" onclick="sendLovePoke('heart')" style="gap:6px; color:#EC4899; border-color:rgba(236, 72, 153, 0.4);"`,
  `class="btn-action-sheet btn-poke" onclick="sendLovePoke('heart')"`
);

// 9. Update floatingCompassBearing style class
content = content.replace(
  `id="floatingCompassBearing" style="font-size:11px; color:#38BDF8; font-weight:700; margin-top:3px;"`,
  `id="floatingCompassBearing" class="floating-compass-pill"`
);

const compassPillCss = `
    .floating-compass-pill {
      font-size: 11px;
      color: #38BDF8;
      font-weight: 700;
      margin-top: 4px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: rgba(56, 189, 248, 0.12);
      padding: 3px 10px;
      border-radius: 999px;
      border: 1px solid rgba(56, 189, 248, 0.25);
    }
`;

if (!content.includes('floating-compass-pill')) {
  content = content.replace('  </style>', compassPillCss + '  </style>');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('UI/UX Optimization successfully applied to index.html!');
