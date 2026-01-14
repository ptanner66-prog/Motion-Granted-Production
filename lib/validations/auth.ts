import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})

export const registerSchema = z.object({
  // Attorney Information
  full_name: z.string().min(2, 'Full name is required'),
  bar_number: z.string().min(1, 'Bar number is required'),
  states_licensed: z.array(z.string()).min(1, 'Select at least one state'),
  email: z.string().email('Please enter a valid email address'),
  phone: z.string().min(10, 'Please enter a valid phone number'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirm_password: z.string(),

  // Firm Information
  firm_name: z.string().optional(),
  firm_address: z.string().optional(),
  firm_phone: z.string().optional(),

  // Terms Acceptance
  terms_accepted: z.literal(true, {
    message: 'You must accept the Terms of Service',
  }),
  disclaimer_accepted: z.literal(true, {
    message: 'You must acknowledge the disclaimer',
  }),
}).refine((data) => data.password === data.confirm_password, {
  message: 'Passwords do not match',
  path: ['confirm_password'],
})

export const forgotPasswordSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
})

export const resetPasswordSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirm_password: z.string(),
}).refine((data) => data.password === data.confirm_password, {
  message: 'Passwords do not match',
  path: ['confirm_password'],
})

export type LoginInput = z.infer<typeof loginSchema>
export type RegisterInput = z.infer<typeof registerSchema>
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
