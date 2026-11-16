// The adjustment math lives in @app/image-core so the browser live preview
// and the server export use exactly the same formulas.
export { applyAdjust, buildChannelLuts, isIdentityAdjust } from '@app/image-core';
