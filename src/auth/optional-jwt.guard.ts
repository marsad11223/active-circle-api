import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  // Override handleRequest to not throw error if no token
  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    // If there's an error or no user, return null instead of throwing
    // This allows the endpoint to work for both authenticated and unauthenticated users
    if (err || !user) {
      return null;
    }
    return user;
  }

  // Override canActivate to catch errors and allow request to proceed
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    // Try to authenticate, but catch errors and allow request to proceed
    const result = super.canActivate(context);
    if (result instanceof Promise) {
      return result.catch(() => {
        // If authentication fails (no token, invalid token, etc.), allow the request anyway
        return true;
      });
    }
    // If it's a boolean or Observable, return as is
    return result;
  }
}

