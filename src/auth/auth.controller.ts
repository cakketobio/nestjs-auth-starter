import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { StringValue } from 'ms';
import ms from 'ms';

import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from '../common/constants';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-request';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Create a user account' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login and set access and refresh tokens as HttpOnly cookies',
  })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(dto);
    this.setAccessCookie(response, result.accessToken);
    this.setRefreshCookie(response, result.refreshToken);
    return {
      user: result.user,
    };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Rotate auth cookies using the refresh token cookie',
  })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.refresh(
      request.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined,
    );
    this.setAccessCookie(response, result.accessToken);
    this.setRefreshCookie(response, result.refreshToken);
    return {
      user: result.user,
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Revoke current session and clear auth cookies' })
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.logout(
      user.id,
      request.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined,
    );
    this.clearAuthCookies(response);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Revoke all sessions and clear auth cookies' })
  async logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.logoutAll(user.id);
    this.clearAuthCookies(response);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Change the current user password and revoke all sessions',
  })
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.changePassword(user.id, dto);
    this.clearAuthCookies(response);
  }

  @Get('me')
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Get the current authenticated user' })
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getMe(user.id);
  }

  private setAccessCookie(response: Response, accessToken: string) {
    response.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
      httpOnly: true,
      secure: this.configService.get<string>('NODE_ENV') === 'production',
      sameSite: 'lax',
      maxAge: this.getAccessTokenMaxAgeMs(),
      path: '/',
    });
  }

  private setRefreshCookie(response: Response, refreshToken: string) {
    response.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
      httpOnly: true,
      secure: this.configService.get<string>('NODE_ENV') === 'production',
      sameSite: 'lax',
      maxAge: this.authService.getRefreshTokenMaxAgeMs(),
      path: '/',
    });
  }

  private clearAuthCookies(response: Response) {
    const options = {
      httpOnly: true,
      secure: this.configService.get<string>('NODE_ENV') === 'production',
      sameSite: 'lax' as const,
      path: '/',
    };

    response.clearCookie(ACCESS_TOKEN_COOKIE, options);
    response.clearCookie(REFRESH_TOKEN_COOKIE, options);
  }

  private getAccessTokenMaxAgeMs(): number {
    const expiry = this.configService.getOrThrow<string>(
      'JWT_ACCESS_TOKEN_EXPIRY',
    );
    const maxAge = ms(expiry as StringValue);

    return typeof maxAge === 'number' ? maxAge : 15 * 60 * 1000;
  }
}
