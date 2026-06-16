import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

interface CreateUserData {
  email: string;
  passwordHash: string;
  name: string;
  currencyCode?: string;
  timezone?: string;
  language?: string;
  emailVerificationCode?: string;
  emailVerificationExpiresAt?: Date;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateUserData) {
    return this.prisma.user.create({
      data: {
        email: data.email,
        passwordHash: data.passwordHash,
        name: data.name,
        currencyCode: data.currencyCode || 'USD',
        timezone: data.timezone || 'UTC',
        emailVerificationCode: data.emailVerificationCode,
        emailVerificationExpiresAt: data.emailVerificationExpiresAt,
      },
    });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async update(id: string, data: Partial<CreateUserData>) {
    return this.prisma.user.update({
      where: { id },
      data,
    });
  }

  async updatePasswordReset(id: string, data: {
    passwordResetCode: string | null;
    passwordResetExpiresAt: Date | null;
    passwordHash?: string;
    passwordChangedAt?: Date;
  }) {
    return this.prisma.user.update({
      where: { id },
      data,
    });
  }

  async updateEmailVerification(id: string, data: {
    isVerified?: boolean;
    emailVerificationCode: string | null;
    emailVerificationExpiresAt: Date | null;
  }) {
    return this.prisma.user.update({
      where: { id },
      data,
    });
  }

  async updateLastSync(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: { lastSyncAt: new Date() },
    });
  }


  async updateAiResponseMode(userId: string, mode: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { aiResponseMode: mode },
    });
  }

  async updateAiModel(userId: string, model: string) {
    const validModels = ['fast', 'balanced', 'quality'];
    if (!validModels.includes(model)) {
      throw new BadRequestException(`Invalid AI model: ${model}. Must be one of: ${validModels.join(', ')}`);
    }
    return this.prisma.user.update({
      where: { id: userId },
      data: { aiModel: model },
    });
  }

  async updateEmailChange(id: string, data: {
    emailChangePending: string | null;
    emailChangeCode: string | null;
    emailChangeExpiresAt: Date | null;
    email?: string;
  }) {
    return this.prisma.user.update({
      where: { id },
      data,
    });
  }

  async deactivate(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
