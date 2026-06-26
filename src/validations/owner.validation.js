const Joi = require('joi');

// ── Shared sub-schemas ────────────────────────────────────────────────────────
const deliveryAddressSchema = (required = true) => {
  const base = {
    line1:   required ? Joi.string().required() : Joi.string().allow(''),
    line2:   Joi.string().allow(''),
    city:    required ? Joi.string().required() : Joi.string().allow(''),
    pincode: required ? Joi.string().pattern(/^\d{6}$/).required()
                          .messages({ 'string.pattern.base': 'Pincode must be 6 digits' })
                      : Joi.string().pattern(/^\d{6}$/).allow(''),
  };
  return Joi.object(base);
};

const emergencyContactSchema = Joi.object({
  name:     Joi.string().max(100).allow(''),
  phone:    Joi.string().pattern(/^\d{10}$/).allow('').messages({
    'string.pattern.base': 'Emergency contact phone must be 10 digits',
  }),
  relation: Joi.string().max(50).allow(''),
});

// ── Create User ───────────────────────────────────────────────────────────────
const createUser = {
  body: Joi.object().keys({
    // Basic Identity
    name:           Joi.string().min(2).max(100).required()
                      .messages({ 'any.required': 'Full name is required' }),
    phone:          Joi.string().pattern(/^\d{10}$/).required()
                      .messages({
                        'any.required': 'Phone number is required',
                        'string.pattern.base': 'Phone must be a valid 10-digit number',
                      }),
    alternatePhone: Joi.string().pattern(/^\d{10}$/).allow('').messages({
                      'string.pattern.base': 'Alternate phone must be a valid 10-digit number',
                    }),
    email:          Joi.string().email().allow(''),
    password:       Joi.string().min(6).required()
                      .messages({ 'any.required': 'Password is required (min 6 characters)' }),

    // Emergency Contact
    emergencyContact: emergencyContactSchema,

    // Diet & Plan
    dietType:       Joi.string().valid('veg', 'non-veg').default('veg'),
    planId:         Joi.string().valid('plan_1', 'plan_2').required()
                      .messages({ 'any.required': 'Please select a mess plan' }),
    subscriptionType: Joi.string().valid('monthly').default('monthly'),

    // Dates & Slot
    messStartDate:  Joi.date().required()
                      .messages({ 'any.required': 'Mess start date is required' }),
    messStartSlot:  Joi.string().valid('morning', 'night').default('morning'),

    // Accommodation
    roomNumber:     Joi.string().max(20).allow(''),
    hostelName:     Joi.string().max(100).allow(''),

    // Delivery Address
    deliveryAddress: deliveryAddressSchema(true).required()
                       .messages({ 'any.required': 'Delivery address is required' }),

    // Payment
    paymentMethod:  Joi.string().valid('cash', 'upi', 'bank_transfer', 'other').default('cash'),
    paymentStatus:  Joi.string().valid('paid', 'pending', 'due').default('pending'),

    // Misc
    notes:                  Joi.string().max(500).allow(''),
    cancellationAccepted:   Joi.boolean().default(false),

    // Legacy (kept for backward compat)
    planType: Joi.string().valid('monthly', 'weekly', 'trial').default('monthly'),
  }),
};

// ── Update User ───────────────────────────────────────────────────────────────
const updateUser = {
  params: Joi.object().keys({
    userId: Joi.string()
      .custom((value, helpers) => {
        if (!value.match(/^[0-9a-fA-F]{24}$/)) {
          return helpers.message('"userId" must be a valid MongoDB ObjectId');
        }
        return value;
      })
      .required(),
  }),
  body: Joi.object().keys({
    // Basic Identity
    name:           Joi.string().min(2).max(100),
    phone:          Joi.string().pattern(/^\d{10}$/).messages({
                      'string.pattern.base': 'Phone must be 10 digits',
                    }),
    alternatePhone: Joi.string().pattern(/^\d{10}$/).allow(''),
    email:          Joi.string().email().allow(''),

    // Emergency Contact
    emergencyContact: emergencyContactSchema,

    // Status & Diet
    status:         Joi.string().valid('active', 'inactive', 'suspended'),
    dietType:       Joi.string().valid('veg', 'non-veg'),

    // Plan
    planId:         Joi.string().valid('plan_1', 'plan_2'),
    subscriptionType: Joi.string().valid('monthly'),
    subscriptionStatus: Joi.string().valid('active', 'paused', 'cancelled', 'expired'),

    // Accommodation
    roomNumber:     Joi.string().max(20).allow(''),
    hostelName:     Joi.string().max(100).allow(''),

    // Delivery Address
    deliveryAddress: deliveryAddressSchema(false),

    // Payment
    paymentMethod:  Joi.string().valid('cash', 'upi', 'bank_transfer', 'other'),
    paymentStatus:  Joi.string().valid('paid', 'pending', 'due'),

    // Misc
    notes:                Joi.string().max(500).allow(''),
    cancellationAccepted: Joi.boolean(),

    // Legacy
    planType: Joi.string().valid('monthly', 'weekly', 'trial'),
  }).min(1),
};

module.exports = {
  createUser,
  updateUser,
};
