import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Put,
  Query,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { BookingService } from './booking.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingStatusDto } from './dto/update-booking-status.dto';
import { HostDashboardDto } from './dto/host-dashboard.dto';
import { MarkAttendanceDto } from './dto/mark-attendance.dto';
import { MemberBookingsDto } from './dto/member-bookings.dto';
import { CancelBookingDto } from './dto/cancel-booking.dto';
import { AdminListBookingsDto } from './dto/admin-list-bookings.dto';
import { GetUser } from 'src/auth/GetUser.Decorator';
import { IsAdmin } from 'src/utils/helper';
import { User } from 'src/schemas/user.schema';

@Controller('bookings')
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  @UseGuards(AuthGuard('jwt'))
  @Post()
  createBooking(
    @Body() createBookingDto: CreateBookingDto,
    @GetUser() user: any,
  ) {
    // Members can book activities
    return this.bookingService.createBooking(
      createBookingDto,
      user._id.toString(),
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('member/my-bookings')
  getMemberBookings(@Query() query: MemberBookingsDto, @GetUser() user: any) {
    // Get filtered bookings for the current member
    return this.bookingService.getMemberBookings(
      user._id.toString(),
      query.filter || 'all',
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('host/pending')
  getHostPendingBookings(@GetUser() user: any) {
    // Get all pending bookings for the current host
    return this.bookingService.getHostPendingBookings(user._id.toString());
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('host/dashboard')
  getHostDashboard(@Query() query: HostDashboardDto, @GetUser() user: any) {
    // Get dashboard data for host with filters
    return this.bookingService.getHostDashboard(
      user._id.toString(),
      query.status,
      query.activityId,
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('host/activity/:activityId/attendance')
  getActivityBookingsForAttendance(
    @Param('activityId') activityId: string,
    @GetUser() user: any,
  ) {
    // Get all confirmed bookings for an activity (for attendance marking)
    return this.bookingService.getActivityBookingsForAttendance(
      activityId,
      user._id.toString(),
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('host/activity/:activityId/members')
  getActivityMembers(
    @Param('activityId') activityId: string,
    @GetUser() user: any,
  ) {
    // Get all members (confirmed + pending) for an activity
    return this.bookingService.getActivityMembers(
      activityId,
      user._id.toString(),
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Put('mark-attendance')
  markAttendance(
    @Body() markAttendanceDto: MarkAttendanceDto,
    @GetUser() user: any,
  ) {
    // Mark attendance for a booking (present/absent)
    return this.bookingService.markAttendance(
      markAttendanceDto.bookingId,
      markAttendanceDto.attendanceStatus,
      user._id.toString(),
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Put(':id/approve')
  approveBooking(@Param('id') id: string, @GetUser() user: any) {
    // Host can approve bookings
    return this.bookingService.approveBooking(id, user._id.toString());
  }

  @UseGuards(AuthGuard('jwt'))
  @Put(':id/decline')
  declineBooking(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateBookingStatusDto,
    @GetUser() user: any,
  ) {
    // Host can decline bookings
    return this.bookingService.declineBooking(
      id,
      user._id.toString(),
      updateStatusDto.declineReason,
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Put('member/:id/cancel')
  cancelBookingByMember(
    @Param('id') id: string,
    @Body() cancelBookingDto: CancelBookingDto,
    @GetUser() user: any,
  ) {
    // Member can cancel their own confirmed bookings
    return this.bookingService.cancelBookingByMember(
      id,
      user._id.toString(),
      cancelBookingDto.cancelReason,
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('member/payment-history')
  getPaymentHistory(@GetUser() user: any) {
    // Get payment history with summary statistics for the current member
    return this.bookingService.getPaymentHistory(user._id.toString());
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('member/invoice/:id')
  getInvoiceDetails(@Param('id') id: string, @GetUser() user: any) {
    // Get invoice details for a specific booking
    return this.bookingService.getInvoiceDetails(id, user._id.toString());
  }

  @UseGuards(AuthGuard('jwt'))
  @Get(':id')
  getBookingById(@Param('id') id: string, @GetUser() user: any) {
    // Get booking details (member, host, or superAdmin can view)
    return this.bookingService.getBookingById(id, user._id.toString());
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('admin/all')
  getAllBookingsForAdmin(
    @Query() filters: AdminListBookingsDto,
    @GetUser() user: User,
  ) {
    // Admin only endpoint - get paginated list of all bookings with filters
    IsAdmin(user);
    return this.bookingService.getAllBookingsForAdmin(filters);
  }
}
