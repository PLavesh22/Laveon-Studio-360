/**
 * Verification test suite for Beginner-Proof Guided Camera System modules
 */
import { computeDirectionalGuidance, formatProgressSummary } from './src/services/directionalGuidance.ts';
import { AlignmentValidator } from './src/services/alignmentValidator.ts';
import { CaptureCountdown } from './src/services/captureCountdown.ts';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

console.log('\n=== 1. Testing Angle Normalization & 0°/360° Wraparound ===');

// Test 1: Wrap-around across 0° (current yaw 355°, target yaw 10° -> delta should be +15° right)
const target1 = { id: 't1', index: 0, tier: 'horizon', targetYaw: 10, targetPitch: 0, label: '10°', instruction: '', isCaptured: false };
const res1 = computeDirectionalGuidance({
  target: target1,
  currentYaw: 355,
  currentPitch: 0,
  currentRoll: 0,
  angularVelocity: 0,
  isCountdownActive: false,
  countdownSeconds: 3,
  isCapturing: false,
  recentlyCaptured: false,
  phoneMovedWarning: false,
  capturedCount: 0,
  totalCount: 10,
});
assert(res1.primaryDirection === 'turn_right', 'From 355° to 10° turns right across 0° boundary');
assert(res1.instruction === 'Turn a little more.' || res1.instruction === 'Almost there — move slowly.' || res1.instruction === 'Turn slowly to your right.', `Instruction is clear: "${res1.instruction}"`);

// Test 2: Wrap-around left (current yaw 5°, target yaw 350° -> delta should be -15° left)
const target2 = { id: 't2', index: 0, tier: 'horizon', targetYaw: 350, targetPitch: 0, label: '350°', instruction: '', isCaptured: false };
const res2 = computeDirectionalGuidance({
  target: target2,
  currentYaw: 5,
  currentPitch: 0,
  currentRoll: 0,
  angularVelocity: 0,
  isCountdownActive: false,
  countdownSeconds: 3,
  isCapturing: false,
  recentlyCaptured: false,
  phoneMovedWarning: false,
  capturedCount: 0,
  totalCount: 10,
});
assert(res2.primaryDirection === 'turn_left', 'From 5° to 350° turns left across 0° boundary');

// Test 3: Off-screen clamping
const targetFar = { id: 'tf', index: 0, tier: 'horizon', targetYaw: 180, targetPitch: 0, label: '180°', instruction: '', isCaptured: false };
const resFar = computeDirectionalGuidance({
  target: targetFar,
  currentYaw: 0,
  currentPitch: 0,
  currentRoll: 0,
  angularVelocity: 0,
  isCountdownActive: false,
  countdownSeconds: 3,
  isCapturing: false,
  recentlyCaptured: false,
  phoneMovedWarning: false,
  capturedCount: 0,
  totalCount: 10,
});
assert(!resFar.isInView, '180° target is off-screen');
assert(resFar.screenX >= 8 && resFar.screenX <= 92, `Screen X is clamped to viewport bounds (${resFar.screenX}%)`);
assert(resFar.instruction === 'Turn slowly to your right.', `Instruction is: "${resFar.instruction}"`);

console.log('\n=== 2. Testing Beginner-Friendly Plain-English Guidance ===');

// Test 4: Approaching alignment (angular distance 5°)
const targetNear = { id: 'tn', index: 0, tier: 'horizon', targetYaw: 5, targetPitch: 0, label: '5°', instruction: '', isCaptured: false };
const resNear = computeDirectionalGuidance({
  target: targetNear,
  currentYaw: 0,
  currentPitch: 0,
  currentRoll: 0,
  angularVelocity: 0,
  isCountdownActive: false,
  countdownSeconds: 3,
  isCapturing: false,
  recentlyCaptured: false,
  phoneMovedWarning: false,
  capturedCount: 0,
  totalCount: 10,
});
assert(resNear.instruction === 'Almost there — move slowly.', `Within 7° shows "Almost there — move slowly." (got "${resNear.instruction}")`);

// Test 5: Target aligned but phone moving
const resMoving = computeDirectionalGuidance({
  target: targetNear,
  currentYaw: 5,
  currentPitch: 0,
  currentRoll: 0,
  angularVelocity: 8.0, // Moving fast
  isCountdownActive: false,
  countdownSeconds: 3,
  isCapturing: false,
  recentlyCaptured: false,
  phoneMovedWarning: false,
  capturedCount: 0,
  totalCount: 10,
});
assert(resMoving.instruction === 'Stop moving.', `Aligned but moving shows "Stop moving." (got "${resMoving.instruction}")`);

// Test 6: Countdown active
const resCountdown = computeDirectionalGuidance({
  target: targetNear,
  currentYaw: 5,
  currentPitch: 0,
  currentRoll: 0,
  angularVelocity: 1.0,
  isCountdownActive: true,
  countdownSeconds: 2,
  isCapturing: false,
  recentlyCaptured: false,
  phoneMovedWarning: false,
  capturedCount: 0,
  totalCount: 10,
});
assert(resCountdown.instruction === 'Perfect! Hold your phone still.', `During countdown shows "Perfect! Hold your phone still." (got "${resCountdown.instruction}")`);

// Test 7: Phone moved warning
const resMoved = computeDirectionalGuidance({
  target: targetNear,
  currentYaw: 15,
  currentPitch: 0,
  currentRoll: 0,
  angularVelocity: 3.0,
  isCountdownActive: false,
  countdownSeconds: 3,
  isCapturing: false,
  recentlyCaptured: false,
  phoneMovedWarning: true,
  capturedCount: 0,
  totalCount: 10,
});
assert(resMoved.instruction === 'Your phone moved. Please try again.', `Phone moved warning displays correctly (got "${resMoved.instruction}")`);

// Test 8: Progress summary text
assert(formatProgressSummary(6, 12) === '6 of 12 photos captured — halfway there!', 'Halfway progress formatted correctly');
assert(formatProgressSummary(11, 12) === '11 of 12 photos captured — 1 last shot remaining!', '1 remaining formatted correctly');

console.log('\n=== 3. Testing Alignment & Stability Detection ===');

const validator = new AlignmentValidator({ toleranceDegrees: 3.5, maxAngularVelocity: 4.5 });

// Test 9: Perfectly aligned and still
const eval1 = validator.evaluate(1.5, 0, false, false, true);
assert(eval1.isWithinTolerance && eval1.isLevel, 'Within tolerance and level');

console.log('\n=== 4. Testing 3-Second Countdown & Cancellation on Movement ===');

const countdown = new CaptureCountdown(3000);

// Test 10: Countdown starts when ready
const tick1 = countdown.update(true);
assert(tick1.isActive, 'Countdown is active after alignment');
assert(tick1.secondsRemaining === 3, 'Initial countdown starts at 3 seconds');

// Test 11: Countdown cancellation when phone moves
const tickMoved = countdown.update(false); // Phone moved out of tolerance!
assert(!tickMoved.isActive, 'Countdown stops when phone moves');
assert(tickMoved.wasCanceled && tickMoved.cancelReason === 'phone_moved', 'Cancellation reason is phone_moved');
assert(countdown.isMovementWarning(), 'Movement warning is activated on cancellation');

console.log(`\n========================================`);
console.log(`Results: ${passed} PASSED, ${failed} FAILED`);
console.log(`========================================\n`);

if (failed > 0) process.exit(1);
