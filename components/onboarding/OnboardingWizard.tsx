'use client';

/**
 * Onboarding Wizard Component
 *
 * Multi-step onboarding for new users:
 * 1. Welcome & account setup verification
 * 2. Profile completion (bar number, firm info)
 * 3. First order walkthrough
 * 4. Tips & best practices
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import {
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  User,
  Building,
  FileText,
  Lightbulb,
  Loader2,
  Scale,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// TYPES
// ============================================================================

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: typeof User;
}

interface ProfileData {
  fullName: string;
  barNumber: string;
  firmName: string;
  firmAddress: string;
  firmPhone: string;
}

interface OnboardingWizardProps {
  userId: string;
  userEmail: string;
  initialProfile?: Partial<ProfileData>;
  onComplete?: () => void;
}

// ============================================================================
// STEPS CONFIGURATION
// ============================================================================

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Motion Granted',
    description: 'Let\'s get you set up to create your first legal motion.',
    icon: Scale,
  },
  {
    id: 'profile',
    title: 'Complete Your Profile',
    description: 'We need some information to personalize your motions.',
    icon: User,
  },
  {
    id: 'firm',
    title: 'Firm Information',
    description: 'This will appear in your signature blocks.',
    icon: Building,
  },
  {
    id: 'firstOrder',
    title: 'Your First Motion',
    description: 'A quick overview of how to submit orders.',
    icon: FileText,
  },
  {
    id: 'tips',
    title: 'Pro Tips',
    description: 'Get the most out of Motion Granted.',
    icon: Lightbulb,
  },
];

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function OnboardingWizard({
  userId,
  userEmail,
  initialProfile,
  onComplete,
}: OnboardingWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [profile, setProfile] = useState<ProfileData>({
    fullName: initialProfile?.fullName || '',
    barNumber: initialProfile?.barNumber || '',
    firmName: initialProfile?.firmName || '',
    firmAddress: initialProfile?.firmAddress || '',
    firmPhone: initialProfile?.firmPhone || '',
  });

  const router = useRouter();
  const { toast } = useToast();
  const supabase = createClient();

  const progress = ((currentStep + 1) / ONBOARDING_STEPS.length) * 100;
  const step = ONBOARDING_STEPS[currentStep];

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleNext = async () => {
    // Validate current step
    if (step.id === 'profile') {
      if (!profile.fullName.trim()) {
        toast({
          title: 'Name Required',
          description: 'Please enter your full name.',
          variant: 'destructive',
        });
        return;
      }
    }

    if (step.id === 'firm' && profile.firmName) {
      // Save profile data
      setIsLoading(true);
      try {
        const { error } = await supabase
          .from('profiles')
          .update({
            full_name: profile.fullName,
            bar_number: profile.barNumber || null,
            firm_name: profile.firmName || null,
            firm_address: profile.firmAddress || null,
            firm_phone: profile.firmPhone || null,
            onboarding_completed: currentStep === ONBOARDING_STEPS.length - 2,
          })
          .eq('id', userId);

        if (error) throw error;
      } catch (error) {
        toast({
          title: 'Save Failed',
          description: 'Could not save profile. Please try again.',
          variant: 'destructive',
        });
        setIsLoading(false);
        return;
      }
      setIsLoading(false);
    }

    if (currentStep < ONBOARDING_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      // Complete onboarding
      setIsLoading(true);
      try {
        await supabase
          .from('profiles')
          .update({ onboarding_completed: true })
          .eq('id', userId);

        toast({
          title: 'Welcome to Motion Granted!',
          description: 'You\'re all set up. Let\'s create your first motion.',
        });

        onComplete?.();
        router.push('/dashboard/submit');
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Could not complete onboarding.',
          variant: 'destructive',
        });
      }
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = async () => {
    // Mark onboarding as skipped
    await supabase
      .from('profiles')
      .update({ onboarding_completed: true })
      .eq('id', userId);

    onComplete?.();
    router.push('/dashboard');
  };

  // ============================================================================
  // STEP CONTENT
  // ============================================================================

  const renderStepContent = () => {
    switch (step.id) {
      case 'welcome':
        return (
          <div className="text-center py-8">
            <Scale className="h-16 w-16 mx-auto mb-6 text-teal" />
            <h2 className="text-2xl font-bold text-navy mb-4">
              Welcome, {profile.fullName || userEmail.split('@')[0]}!
            </h2>
            <p className="text-gray-600 max-w-md mx-auto mb-8">
              Motion Granted uses AI to help you draft professional legal motions
              in minutes, not hours. Let&apos;s get you set up.
            </p>
            <div className="grid gap-4 sm:grid-cols-3 max-w-lg mx-auto">
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="font-bold text-2xl text-teal">14</p>
                <p className="text-sm text-gray-500">AI Phases</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="font-bold text-2xl text-teal">A-</p>
                <p className="text-sm text-gray-500">Min Quality</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="font-bold text-2xl text-teal">100%</p>
                <p className="text-sm text-gray-500">Citation Verified</p>
              </div>
            </div>
          </div>
        );

      case 'profile':
        return (
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name (as it appears on filings)</Label>
              <Input
                id="fullName"
                value={profile.fullName}
                onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
                placeholder="John Q. Attorney"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="barNumber">Bar Number (optional)</Label>
              <Input
                id="barNumber"
                value={profile.barNumber}
                onChange={(e) => setProfile({ ...profile, barNumber: e.target.value })}
                placeholder="123456"
              />
              <p className="text-xs text-gray-500">
                Used for signature blocks and certificate of service
              </p>
            </div>
          </div>
        );

      case 'firm':
        return (
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="firmName">Firm Name</Label>
              <Input
                id="firmName"
                value={profile.firmName}
                onChange={(e) => setProfile({ ...profile, firmName: e.target.value })}
                placeholder="Smith & Associates, LLC"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="firmAddress">Firm Address</Label>
              <Input
                id="firmAddress"
                value={profile.firmAddress}
                onChange={(e) => setProfile({ ...profile, firmAddress: e.target.value })}
                placeholder="123 Main Street, Suite 456, City, State ZIP"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="firmPhone">Firm Phone</Label>
              <Input
                id="firmPhone"
                value={profile.firmPhone}
                onChange={(e) => setProfile({ ...profile, firmPhone: e.target.value })}
                placeholder="(555) 123-4567"
              />
            </div>
          </div>
        );

      case 'firstOrder':
        return (
          <div className="py-4">
            <ol className="space-y-6">
              <li className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-teal/10 flex items-center justify-center text-teal font-bold">
                  1
                </div>
                <div>
                  <p className="font-semibold text-navy">Select Your Motion Type</p>
                  <p className="text-sm text-gray-600">
                    Choose from our catalog of supported motions, organized by complexity tier.
                  </p>
                </div>
              </li>
              <li className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-teal/10 flex items-center justify-center text-teal font-bold">
                  2
                </div>
                <div>
                  <p className="font-semibold text-navy">Enter Case Details</p>
                  <p className="text-sm text-gray-600">
                    Provide the case caption, jurisdiction, and your statement of facts.
                  </p>
                </div>
              </li>
              <li className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-teal/10 flex items-center justify-center text-teal font-bold">
                  3
                </div>
                <div>
                  <p className="font-semibold text-navy">Upload Supporting Documents</p>
                  <p className="text-sm text-gray-600">
                    Include any relevant pleadings, exhibits, or reference materials.
                  </p>
                </div>
              </li>
              <li className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-teal/10 flex items-center justify-center text-teal font-bold">
                  4
                </div>
                <div>
                  <p className="font-semibold text-navy">Review & Submit</p>
                  <p className="text-sm text-gray-600">
                    Our AI will generate your motion, typically ready within 24-48 hours.
                  </p>
                </div>
              </li>
            </ol>
          </div>
        );

      case 'tips':
        return (
          <div className="py-4 space-y-4">
            <div className="flex gap-4 p-4 bg-blue-50 rounded-lg">
              <Lightbulb className="h-6 w-6 text-blue-600 flex-shrink-0" />
              <div>
                <p className="font-semibold text-blue-900">Be Specific in Your Instructions</p>
                <p className="text-sm text-blue-700">
                  The more detail you provide about your arguments and strategy, the better the output.
                </p>
              </div>
            </div>
            <div className="flex gap-4 p-4 bg-green-50 rounded-lg">
              <CheckCircle2 className="h-6 w-6 text-green-600 flex-shrink-0" />
              <div>
                <p className="font-semibold text-green-900">Always Review Before Filing</p>
                <p className="text-sm text-green-700">
                  AI-generated drafts should be reviewed for accuracy and local practice compliance.
                </p>
              </div>
            </div>
            <div className="flex gap-4 p-4 bg-amber-50 rounded-lg">
              <FileText className="h-6 w-6 text-amber-600 flex-shrink-0" />
              <div>
                <p className="font-semibold text-amber-900">Use the Revision Feature</p>
                <p className="text-sm text-amber-700">
                  If the draft needs changes, request a revision with specific feedback.
                </p>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        {/* Progress Header */}
        <CardHeader className="border-b">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              {ONBOARDING_STEPS.map((s, i) => (
                <div
                  key={s.id}
                  className={cn(
                    'w-3 h-3 rounded-full transition-colors',
                    i < currentStep
                      ? 'bg-teal'
                      : i === currentStep
                      ? 'bg-teal/50 ring-2 ring-teal ring-offset-2'
                      : 'bg-gray-200'
                  )}
                />
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSkip}
              className="text-gray-500"
            >
              Skip for now
            </Button>
          </div>
          <Progress value={progress} className="h-1" />

          <div className="flex items-center gap-3 mt-6">
            <div className="p-2 bg-teal/10 rounded-lg">
              <step.icon className="h-6 w-6 text-teal" />
            </div>
            <div>
              <CardTitle className="text-xl">{step.title}</CardTitle>
              <CardDescription>{step.description}</CardDescription>
            </div>
          </div>
        </CardHeader>

        {/* Step Content */}
        <CardContent className="pt-6">
          {renderStepContent()}
        </CardContent>

        {/* Navigation */}
        <div className="flex items-center justify-between p-6 border-t bg-gray-50">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === 0 || isLoading}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back
          </Button>

          <Button
            onClick={handleNext}
            disabled={isLoading}
            className="bg-teal hover:bg-teal/90"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : null}
            {currentStep === ONBOARDING_STEPS.length - 1 ? (
              'Get Started'
            ) : (
              <>
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </>
            )}
          </Button>
        </div>
      </Card>
    </div>
  );
}

export default OnboardingWizard;
