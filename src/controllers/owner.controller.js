const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const User = require('../models/User');
const { generateUserId } = require('../services/userId.service');
const { getPlan } = require('../config/messPlans');
const { generateLogsFromStartDate, pauseLogs } = require('../services/mealLog.service');

// ─────────────────────────────────────────────────────────────────────────────
// CREATE USER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @desc    Create a new mess user under this owner's service
 * @route   POST /api/owner/users
 * @access  Private (Owner)
 */
exports.createUser = asyncHandler(async (req, res, next) => {
  const owner = req.user;
  const {
    name, email, phone, password,
    alternatePhone, emergencyContact,
    dietType, planId, subscriptionType,
    messStartDate, messStartSlot,
    roomNumber, hostelName,
    deliveryAddress,
    paymentMethod, paymentStatus,
    notes, cancellationAccepted,
    // Legacy
    planType,
  } = req.body;

  // Validate plan
  const plan = getPlan(planId);
  if (!plan) {
    return next(new ApiError(400, `Invalid planId: ${planId}. Valid options: plan_1, plan_2`));
  }

  // Generate unique User ID (e.g. AP0001)
  const customUserId = await generateUserId(owner.serviceId, owner.prefix);

  const user = await User.create({
    userId: customUserId,
    name,
    email,
    phone,
    password,
    alternatePhone,
    emergencyContact,
    role: 'user',
    serviceId: owner.serviceId,
    dietType,
    planId,
    planName:       plan.name,
    pricePerTiffin: plan.pricePerTiffin,
    subscriptionType: subscriptionType || 'monthly',
    planType:       planType || 'monthly', // Legacy
    messStartDate:  messStartDate || new Date(),
    messStartSlot:  messStartSlot || 'morning',
    planStartDate:  messStartDate || new Date(), // Legacy
    roomNumber,
    hostelName,
    deliveryAddress,
    paymentMethod:  paymentMethod || 'cash',
    paymentStatus:  paymentStatus || 'pending',
    notes,
    cancellationAccepted: cancellationAccepted || false,
    subscriptionStatus: 'active',
    createdBy: owner._id,
  });

  // ── Auto-generate meal logs from start date ───────────────────────────────
  let logResult = { insertedCount: 0 };
  try {
    logResult = await generateLogsFromStartDate(user);
  } catch (err) {
    // Non-fatal: user is created; log generation failure is recoverable
    console.error(`[MealLog] Backfill failed for user ${user._id}: ${err.message}`);
  }

  res.status(201).json(
    new ApiResponse(201, {
      user,
      mealLogsGenerated: logResult.insertedCount,
    }, `User ${user.userId} created successfully with ${logResult.insertedCount} meal logs backfilled`)
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// GET ALL USERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @desc    Get all mess users for this owner's service
 * @route   GET /api/owner/users
 * @access  Private (Owner)
 */
exports.getUsers = asyncHandler(async (req, res) => {
  const { status, subscriptionStatus, dietType, planId, search } = req.query;
  const owner = req.user;

  const filter = { role: 'user', serviceId: owner.serviceId };
  if (status) filter.status = status;
  if (subscriptionStatus) filter.subscriptionStatus = subscriptionStatus;
  if (dietType) filter.dietType = dietType;
  if (planId) filter.planId = planId;
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
      { userId: { $regex: search, $options: 'i' } },
    ];
  }

  const users = await User.find(filter)
    .select('-password')
    .sort({ createdAt: -1 });

  res.status(200).json(
    new ApiResponse(200, { users, count: users.length }, 'Users retrieved successfully')
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// GET SINGLE USER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @desc    Get a single user by ID
 * @route   GET /api/owner/users/:userId
 * @access  Private (Owner)
 */
exports.getUser = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;
  const owner = req.user;

  const user = await User.findOne({
    _id: userId,
    role: 'user',
    serviceId: owner.serviceId,
  }).select('-password');

  if (!user) {
    return next(new ApiError(404, 'User not found or does not belong to your service'));
  }

  res.status(200).json(
    new ApiResponse(200, { user }, 'User retrieved successfully')
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE USER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @desc    Update a user's profile and subscription details
 * @route   PUT /api/owner/users/:userId
 * @access  Private (Owner)
 */
exports.updateUser = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;
  const owner = req.user;

  // If planId is changing, update plan snapshot fields
  if (req.body.planId) {
    const plan = getPlan(req.body.planId);
    if (!plan) {
      return next(new ApiError(400, `Invalid planId: ${req.body.planId}`));
    }
    req.body.planName = plan.name;
    req.body.pricePerTiffin = plan.pricePerTiffin;
  }

  const user = await User.findOneAndUpdate(
    { _id: userId, role: 'user', serviceId: owner.serviceId },
    req.body,
    { returnDocument: 'after', runValidators: true }
  ).select('-password');

  if (!user) {
    return next(new ApiError(404, 'User not found or does not belong to your service'));
  }

  res.status(200).json(
    new ApiResponse(200, { user }, 'User updated successfully')
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// PAUSE SUBSCRIPTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @desc    Pause a user's subscription for a date range
 * @route   POST /api/owner/users/:userId/pause
 * @access  Private (Owner)
 */
exports.pauseSubscription = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;
  const { fromDate, toDate, reason } = req.body;
  const owner = req.user;

  const user = await User.findOne({
    _id: userId,
    role: 'user',
    serviceId: owner.serviceId,
  });

  if (!user) {
    return next(new ApiError(404, 'User not found'));
  }

  if (user.subscriptionStatus !== 'active') {
    return next(new ApiError(400, `Cannot pause a ${user.subscriptionStatus} subscription`));
  }

  if (!fromDate || !toDate) {
    return next(new ApiError(400, 'fromDate and toDate are required for pausing'));
  }

  const from = new Date(fromDate);
  const to = new Date(toDate);
  if (from > to) {
    return next(new ApiError(400, 'fromDate must be before toDate'));
  }

  // Add to pause history
  user.pauseDates.push({ from, to, reason });
  user.subscriptionStatus = 'paused';
  await user.save();

  // Mark meal logs in the date range as paused
  const pausedCount = await pauseLogs(user._id, owner.serviceId, from, to);

  res.status(200).json(
    new ApiResponse(200, {
      user,
      pausedLogsCount: pausedCount,
    }, `Subscription paused from ${from.toDateString()} to ${to.toDateString()}`)
  );
});

/**
 * @desc    Resume a paused subscription
 * @route   POST /api/owner/users/:userId/resume
 * @access  Private (Owner)
 */
exports.resumeSubscription = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;
  const owner = req.user;

  const user = await User.findOne({
    _id: userId,
    role: 'user',
    serviceId: owner.serviceId,
  });

  if (!user) return next(new ApiError(404, 'User not found'));
  if (user.subscriptionStatus !== 'paused') {
    return next(new ApiError(400, 'Subscription is not currently paused'));
  }

  // Close the most recent open pause period
  const openPause = user.pauseDates.find((p) => !p.to);
  if (openPause) {
    openPause.to = new Date();
  }

  user.subscriptionStatus = 'active';
  await user.save();

  res.status(200).json(
    new ApiResponse(200, { user }, 'Subscription resumed successfully')
  );
});
