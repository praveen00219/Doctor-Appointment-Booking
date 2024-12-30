import userModel from '../models/userModels.js';
import doctorModel from '../models/doctorModels.js'
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import appointmentModel from '../models/appointmentModels.js';
import moment from 'moment';
import twilio from "twilio";
import Razorpay from "razorpay";
import crypto from "crypto";
import { sendEmailhandler } from '../utilities/sendEmail.js';
import CryptoJS from 'crypto-js';
import decryptData from '../utilities/decryptData.js';

// login call back
export const loginController = async (req, res) => {
    const { encryptedObj } = req.body;
    console.log(process.env.CRYPTO_SECRET_KEY)

    try {
        const { email, password } = decryptData(encryptedObj);
        console.log({ email, password })
        const user = await userModel.findOne({ email });
        if (user) {
            console.log(password);
            const isMatch = await bcrypt.compare(password, user.password);
            if (false === isMatch) {
                return res.status(200).send({
                    message: 'invalid credationals',
                    success: false
                });
            } else {
                var userType = "user";
                if (user.isDoctor) userType = "doctor";
                else if (user.isAdmin) userType = "admin";
                const token = jwt.sign({ id: user._id, userType }, process.env.JWT_SECRET, { expiresIn: '1d' });
                return res.status(200).send({
                    message: 'Login successfully',
                    token,
                    success: true,
                });
            }
        } else {
            res.status(200).send({
                message: 'invalid credationals',
                success: false
            });
        }
    } catch (error) {
        res.status(500).send({
            message: `Login Controller : ${error.message}`,
            success: false,
        });
    }
}

export const sendOtp = async (req, res) => {
    try {
        const accountSid = process.env.ACCOUNT_SID;
        const authToken = process.env.AUTH_TOKEN;
        const verifySid = process.env.VERIFY_SID;
        const client = twilio(accountSid, authToken);
        const contact = req.body.contact;
        //console.log(req.body);
        const rsp = await client.verify.v2.services(verifySid)
            .verifications.create({ to: `+91${contact}`, channel: "sms" });
        return res.status(200).send({
            message: "response is sent successfully",
            success: true,
        })
    } catch (error) {
        console.log("send OTP")
        console.log(error)
        res.status(500).send({
            message: `Register Controller : ${error.message}`,
            success: false,
        });
    }
}

export const verifyOtp = async (req, res) => {
    const { contact, otp } = req.body;
    const accountSid = process.env.ACCOUNT_SID;
    const authToken = process.env.AUTH_TOKEN;
    const verifySid = process.env.VERIFY_SID;
    const client = twilio(accountSid, authToken);
    const { status } = await client.verify.v2
        .services(verifySid)
        .verificationChecks.create({ to: `+91${contact}`, code: otp });
    if ("pending" === status) {
        return res.status(200).json({
            success: false
        })
    } else {
        return res.status(200).json({
            success: true
        })
    }
}

// register call back
export const registerController = async (req, res) => {
    console.log(req.body);
    try {
        const { encryptedObj } = req.body;
        const bytes = CryptoJS.AES.decrypt(encryptedObj, process.env.CRYPTO_SECRET_KEY);
        const { user } = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
        const checkUser = await userModel.findOne({ $or: [{ email: user.email }, { phone: user.phone }] });
        console.log(checkUser);
        if (checkUser) {
            return res.status(200).send({
                message: 'User Already Exists',
                success: false
            });
        }

        user.password = await bcrypt.hash(user.password, 10);
        const newUser = new userModel(user);
        const resp = await newUser.save();
        console.log(resp);
        res.status(201).send({
            message: 'register successfully',
            success: true
        })
    } catch (error) {
        console.log(error)
        return res.status(500).send({
            message: `Register Controller : ${error.message}`,
            success: false,
        });
    }
}

export const getUserDataController = async (req, res) => {
    try {
        const user = await userModel.findById({ _id: req.body.userId });
        user.password = undefined;
        if (!user) {
            res.status(200).send({
                message: 'user not found',
                success: false
            });
        } else {
            res.status(200).send({
                user,
                success: true
            })
        }
    } catch (error) {
        console.log(error);
        res.status(500).send({
            message: 'some thing went wrong',
            success: false
        })
    }
}

export const getAllNotificationController = async (req, res) => {
    try {
        const user = await userModel.findById({ _id: req.body.userId });
        const seennotifications = user.seennotifications;
        const notifications = user.notifications;
        seennotifications.push(...notifications);
        user.seennotifications = notifications;
        user.notifications = []
        const updatedUser = await user.save();
        updatedUser.password = undefined;
        res.status(200).send({
            success: true,
            message: 'all notifactions marked as read',
            user: updatedUser
        })
    } catch (error) {
        console.log(error);
        res.status(500).send({
            success: false,
            error,
            message: 'error while fetching notifications'
        })
    }
}

export const deleteAllNotificationController = async (req, res) => {
    try {
        const user = await userModel.findById({ _id: req.body.userId });
        user.seennotifications = [];
        const updatedUser = await user.save();
        updatedUser.password = undefined;
        res.status(200).send({
            success: true,
            message: 'all notifactions marked as read',
            user: updatedUser
        })
    } catch (error) {
        console.log(error);
        res.status(500).send({
            success: false,
            error,
            message: 'error while fetching notifications'
        })
    }
}

export const getDoctorByIdController = async (req, res) => {
    try {
        console.log(req.body.doctorId);
        const doctor = await doctorModel.findById({ _id: req.body.doctorId }).populate("user");
        console.log(doctor);
        res.status(200).send({
            success: true,
            message: 'single doctor data fetch successfully',
            doctor
        })
    } catch (error) {
        console.log(error);
        res.status(500).send({
            success: false,
            error,
            message: 'doctor profile update issue'
        })
    }
}

export const verifyVideoMeetingIdController = async (req, res) => {
    try {
        console.log("from verify video meeting")
        const response = await appointmentModel.findById(req.body.roomId).populate('doctor');
        if (response && response.user == req.body.userId || response.doctor.user == req.body.userId) {
            return res.status(200).json({
                success: true
            })
        } else {
            return res.status(200).json({
                success: false
            })
        }
    } catch (error) {
        console.log(error);
        res.status(500).send({
            success: false,
            error,
            message: 'error while applying for doctor'
        })
    }
}
import mongoose from 'mongoose';
export const applyDoctorController = async (req, res) => {
    console.log(req.body);
    const doctorInfo = req.body;
    console.log(req.body);
    try {
        const checkDoctor = await doctorModel.findOne({ user: req.body.userId });
        if (checkDoctor) {
            var message = '';
            if (checkDoctor.status === 'approved')
                message = 'your request is already accepted';
            else
                message = 'you are already applied';
            return res.status(200).send({
                message: message,
                success: false
            });
        } else {
            console.log("here")
            const session = await mongoose.startSession();
            const transactionOptions = {
                readPreference: 'primary',
                readConcern: { level: 'snapshot' },
                writeConcern: { w: 'majority' }
            };
            try {
                const transactionResult = await session.withTransaction(async () => {
                    const user = await userModel.findById(req.body.userId).session(session);;
                    const newDoctor = new doctorModel(doctorInfo);
                    const obj = await newDoctor.save({ session });
                    console.log(obj)
                    const adminUser = await userModel.findOne({ isAdmin: true }).session(session);;
                    console.log(adminUser)
                    const notifications = adminUser.notifications;
                    notifications.push({
                        type: 'apply-doctor-request',
                        message: `${user.firstName} ${user.lastName}`,
                        data: {
                            doctorId: newDoctor._id,
                            name: user.firstName + " " + user.lastName,
                            onClickPath: '/admin/doctors'
                        }
                    });
                    await userModel.findByIdAndUpdate(adminUser._id, { notifications }).session(session);;
                    res.status(201).send({
                        success: true,
                        message: 'Doctor account applied successfully'
                    });
                }, transactionOptions);

                if (transactionResult) {
                    console.log("The reservation was successfully created.");
                } else {
                    // await session.abortTransaction();
                    console.log("The transaction was intentionally aborted.");
                }
            }
            catch (error) {
                console.log(error)
                res.status(500).send({
                    message: `error while fetching doctor list : ${error.message}`,
                    success: false,
                });
            } finally {
                await session.endSession();
            }
        }
    } catch (error) {
        console.log(error);
        res.status(500).send({
            success: false,
            error,
            message: 'error while applying for doctor'
        })
    }
}



export const getAllDoctorController = async (req, res) => {
    try {
        const doctorList = await doctorModel.find({ status: 'approved' }).populate('user');
        console.log(doctorList);
        res.status(200).send({
            success: true,
            message: 'doctor list fetched successfully',
            doctorList
        })
    } catch (error) {
        console.log(error);
        res.status(500).send({
            success: false,
            error,
            message: 'error while fetching notifications'
        })
    }
}

export const bookAppointmentController = async (req, res) => {
    const { encryptedObj } = req.body;
    const session = await mongoose.startSession();
    try {

        const decryptedObj = decryptData(encryptedObj);
        const { doctorId, userId, timingSlot, doctorUserId, userName, textfeelling, meetingMode } = decryptedObj;
        const date = moment().add(1, 'day').toDate().toLocaleDateString();
        console.log(date);

        if ("" === textfeelling) {
            return res.status(200).send({
                success: false,
                message: 'Please enter feeling'
            })
        }

        const session = await mongoose.startSession();
        const transactionOptions = {
            readPreference: 'primary',
            readConcern: { level: 'snapshot' },
            writeConcern: { w: 'majority' }
        };
        try {
            const transactionResult = await session.withTransaction(async () => {
                const newAppointment = new appointmentModel({
                    doctor: doctorId, user: userId, time: timingSlot, feel: textfeelling, meetingMode, date
                });
                const temp = await newAppointment.save();
                const doctorData = await userModel.findOne({ _id: doctorUserId });

                doctorData.notifications.push({
                    type: 'New-Appointment-request',
                    message: `A new appointment request from ${userName}`,
                    onClickPath: '/user/appointments'
                });
                await doctorData.save();


                let appointment;
                if (meetingMode === 'online') {
                    let status = "approved"
                    const meetingLink = `http://localhost:3000/video-meeting/${temp._id}`; // generates a unique ID
                    appointment = await appointmentModel.findByIdAndUpdate(temp._id, { status, meetingLink });
                    console.log(appointment);
                } else {
                    let status = "approved"
                    appointment = await appointmentModel.findByIdAndUpdate(temp._id, { status });
                    console.log(appointment);
                }


                const user = await userModel.findOne({ _id: appointment.user });
                user.notifications.push({
                    type: "status-update",
                    message: `your appointment has been updated ${meeting}`,
                    onClickPath: "/doctor-appointments"
                });
                await user.save();

                return res.status(200).send({
                    success: true,
                    message: `Appointment booked succesfully`
                });
            }, transactionOptions);

            if (transactionResult) {
                console.log("The reservation was successfully created.");
            } else {
                // await session.abortTransaction();
                console.log("The transaction was intentionally aborted.");
            }
        } catch (error) {

            res.status(500).send({
                message: `error while fetching doctor list : ${error.message}`,
                success: false,
            });
        } finally {
            await session.endSession();
        }
    } catch (error) {
        res.status(500).send({
            message: `error while fetching doctor list : ${error.message}`,
            success: false,
        });
    } finally {
        await session.endSession();
    }

}

export const bookingAvailabilityController = async (req, res) => {
    try {
        const { doctorId, timingSlot, userId, textfeelling, meetingMode } = req.body;
        console.log(req.body);
        if ("" === timingSlot) {
            return res.status(200).send({
                message: 'please give time slot value',
                success: false,
            });
        }
        const date = moment().add(1, 'day').toDate().toLocaleDateString();
        console.log(date);
        console.log(timingSlot);

        const appointment = await appointmentModel.findOne({
            doctor: doctorId,
            time: timingSlot,
            date
        });
        console.log(appointment)
        if (appointment) {
            return res.status(200).send({
                message: 'appointment on this time is already booked',
                success: false
            });
        } else {
            const newAppointment = new appointmentModel({
                doctor: doctorId, user: userId, time: timingSlot, feel: textfeelling, meetingMode, date
            });
            const temp = await newAppointment.save();
            console.log(temp);
            const timeoutHandler = async () => {
                await appointmentModel.findByIdAndDelete(temp._id);
            };
            setTimeout(timeoutHandler, 50000);
            return res.status(200).send({
                // timerId: id,
                _id: temp._id,
                message: 'appointment on this time is available',
                success: true,
            });
        }
    } catch (error) {
        console.log(error);
        res.status(500).send({
            success: false,
            error,
            message: 'error while checking availability appointment'
        })
    }
}

export const checkAppointmentController = async (req, res) => {
    try {
        const appointmentInfoid = req.body.appointmentInfoid;
        console.log(appointmentInfoid);
        const temp = await appointmentModel.findById(appointmentInfoid);
        console.log(temp);
        if (temp) {
            return res.status(200).send({
                success: true,
                message: 'avalable '
            })
        }
        return res.status(500).send({
            success: false,
            error,
            message: 'server error, Please try again'
        })
    } catch (error) {
        console.log(error);
        res.status(500).send({
            success: false,
            error,
            message: 'server error, Please try again'
        })
    }
}


export const userAppointmentController = async (req, res) => {
    try {
        const appointments = await appointmentModel.find({ user: req.body.userId })
            .populate({
                path: 'doctor',
                populate: {
                    path: 'user',
                    model: 'user'
                }
            });
        console.log(appointments);
        console.log(appointments[0].doctor.user.name);
        res.status(200).send({
            success: true,
            message: 'User appointment fetch successfully',
            appointments
        })
    } catch (error) {
        console.log(error);
        res.status(500).send({
            success: false,
            error,
            message: 'server error, Please try again'
        })
    }
}

export const updatePersonalDetails = async (req, res) => {
    const { encryptedObj } = req.body;
    try {

        console.log(req.body);
        const decryptedObj = decryptData(encryptedObj);
        const user = await userModel.findByIdAndUpdate(
            req.body.userId,
            decryptedObj,
            { new: true }
        );
        console.log(user)
        res.status(200).send({
            success: true,
            message: 'personal details update successfully',
            user
        })
    } catch (error) {
        console.log(error);
        res.status(500).send({
            success: false,
            error,
            message: 'personal details update issue'
        })
    }
}

export const makePaymentController = async (req, res) => {
    try {
        const instance = new Razorpay({
            key_id: process.env.KEY_ID,
            key_secret: process.env.KEY_SECRET,
        });

        console.log(req.body);
        const { amount, currency, payment_capture } = req.body;
        const option = {
            amount: req.body.amount,
            currency: "INR",
            receipt: crypto.randomBytes(10).toString("hex")
        }
        instance.orders.create(option, (error, order) => {
            console.log(order)
            if (error) {
                console.log(error);
                return res.status(500).json({ message: "Somthing Went Wrong" });

            }
            res.status(200).json({ data: order });
        })
    } catch (error) {
        console.log(error);
        res.status(500).send({
            success: false,
            error,
            message: 'Payment is Fauild'
        })
    }
}

export const paymentVerificatonController = async (req, res) => {
    try {
        console.log(req.body)
        return res.status(200).json({
            success: true,
            message: "payment verified succeffully",
        })

    } catch (error) {
        console.log(error);
        return res.status(500).send({
            success: false,
            error,
            message: 'Payment is not Verified'
        })
    }
}

export const emailSendController = async (req, res) => {
    console.log(req.body);

    const user = await userModel.findById(req.body.userId);
    console.log(user.email);

    const temp = await sendEmailhandler(user.email, "For demo", "for demo");
    console.log(temp);

    return res.status(200).send({
        message: "email send succeffull",
    })
}
