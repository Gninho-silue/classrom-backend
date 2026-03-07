import express from "express";
import { randomBytes } from "crypto";
import { and, desc, eq, getTableColumns, ilike, or, sql } from "drizzle-orm";

import { db } from "../db/index.js";
import { classes, departments, enrollments, subjects, user } from "../db/schema/index.js";

const router = express.Router();

// Get all classes with optional search, subject, teacher filters, and pagination
router.get("/", async (req, res) => {
    try {
        const { search, subject, teacher, page = 1, limit = 10 } = req.query;

        const parsedPage = parseInt(page as string, 10);
        const parsedLimit = parseInt(limit as string, 10);
        const currentPage = Math.max(1, Number.isNaN(parsedPage) ? 1 : parsedPage);
        const limitPerPage = Math.max(1, Number.isNaN(parsedLimit) ? 10 : parsedLimit);
        const offset = (currentPage - 1) * limitPerPage;

        const filterConditions = [];

        if (search) {
            filterConditions.push(
                or(
                    ilike(classes.name, `%${search}%`),
                    ilike(classes.inviteCode, `%${search}%`)
                )
            );
        }

        if (subject) {
            filterConditions.push(ilike(subjects.name, `%${subject}%`));
        }

        if (teacher) {
            filterConditions.push(ilike(user.name, `%${teacher}%`));
        }

        const whereClause =
            filterConditions.length > 0 ? and(...filterConditions) : undefined;

        const countResult = await db
            .select({ count: sql<number>`cast(count(*) as integer)` })
            .from(classes)
            .leftJoin(subjects, eq(classes.subjectId, subjects.id))
            .leftJoin(user, eq(classes.teacherId, user.id))
            .where(whereClause);

        const totalCount = countResult[0]?.count ?? 0;

        const classesList = await db
            .select({
                ...getTableColumns(classes),
                subject: {
                    ...getTableColumns(subjects),
                },
                teacher: {
                    ...getTableColumns(user),
                },
            })
            .from(classes)
            .leftJoin(subjects, eq(classes.subjectId, subjects.id))
            .leftJoin(user, eq(classes.teacherId, user.id))
            .where(whereClause)
            .orderBy(desc(classes.createdAt))
            .limit(limitPerPage)
            .offset(offset);

        res.status(200).json({
            data: classesList,
            pagination: {
                page: currentPage,
                limit: limitPerPage,
                total: totalCount,
                totalPages: Math.ceil(totalCount / limitPerPage),
            },
        });
    } catch (error) {
        console.error("GET /classes error:", error);
        res.status(500).json({ error: "Failed to fetch classes" });
    }
});

router.post("/", async (req, res) => {
    try {
        const currentAuth = (req as any).user as { id: string; role: string } | undefined;
        if (!currentAuth || (currentAuth.role !== "admin" && currentAuth.role !== "teacher")) {
            return res.status(403).json({ error: "Forbidden: only admins or teachers can create classes" });
        }

        const {
            name,
            teacherId,
            subjectId,
            capacity,
            description,
            status,
            bannerUrl,
            bannerCldPubId,
        } = req.body;

        const [createdClass] = await db
            .insert(classes)
            .values({
                subjectId,
                inviteCode: randomBytes(4).toString('hex'),
                name,
                teacherId,
                bannerCldPubId,
                bannerUrl,
                capacity,
                description,
                schedules: [],
                status,
            })
            .returning({ id: classes.id });

        if (!createdClass) throw new Error("Insert returned no row");

        res.status(201).json({ data: createdClass });
    } catch (error) {
        console.error("POST /classes error:", error);
        res.status(500).json({ error: "Failed to create class" });
    }
});

// Get class details with counts
router.get("/:id", async (req, res) => {
    try {
        const classId = Number(req.params.id);

        if (!Number.isFinite(classId)) {
            return res.status(400).json({ error: "Invalid class id" });
        }

        const [classDetails] = await db
            .select({
                ...getTableColumns(classes),
                subject: {
                    ...getTableColumns(subjects),
                },
                department: {
                    ...getTableColumns(departments),
                },
                teacher: {
                    ...getTableColumns(user),
                },
            })
            .from(classes)
            .leftJoin(subjects, eq(classes.subjectId, subjects.id))
            .leftJoin(departments, eq(subjects.departmentId, departments.id))
            .leftJoin(user, eq(classes.teacherId, user.id))
            .where(eq(classes.id, classId));

        if (!classDetails) {
            return res.status(404).json({ error: "Class not found" });
        }

        res.status(200).json({ data: classDetails });
    } catch (error) {
        console.error("GET /classes/:id error:", error);
        res.status(500).json({ error: "Failed to fetch class details" });
    }
});

// List users in a class by role with pagination
router.get("/:id/users", async (req, res) => {
    try {
        const classId = Number(req.params.id);
        const { role, page = 1, limit = 10 } = req.query;

        if (!Number.isFinite(classId)) {
            return res.status(400).json({ error: "Invalid class id" });
        }

        if (role !== "teacher" && role !== "student") {
            return res.status(400).json({ error: "Invalid role" });
        }

        const parsedPage = parseInt(page as string, 10);
        const parsedLimit = parseInt(limit as string, 10);
        const currentPage = Math.max(1, Number.isNaN(parsedPage) ? 1 : parsedPage);
        const limitPerPage = Math.max(1, Number.isNaN(parsedLimit) ? 10 : parsedLimit);
        const offset = (currentPage - 1) * limitPerPage;

        const baseSelect = {
            id: user.id,
            name: user.name,
            email: user.email,
            emailVerified: user.emailVerified,
            image: user.image,
            role: user.role,
            imageCldPubId: user.imageCldPubId,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
        };

        const groupByFields = [
            user.id,
            user.name,
            user.email,
            user.emailVerified,
            user.image,
            user.role,
            user.imageCldPubId,
            user.createdAt,
            user.updatedAt,
        ];

        const countResult =
            role === "teacher"
                ? await db
                    .select({ count: sql<number>`count(distinct ${user.id})` })
                    .from(user)
                    .leftJoin(classes, eq(user.id, classes.teacherId))
                    .where(and(eq(user.role, role), eq(classes.id, classId)))
                : await db
                    .select({ count: sql<number>`count(distinct ${user.id})` })
                    .from(user)
                    .leftJoin(enrollments, eq(user.id, enrollments.studentId))
                    .where(and(eq(user.role, role), eq(enrollments.classId, classId)));

        const totalCount = countResult[0]?.count ?? 0;

        const usersList =
            role === "teacher"
                ? await db
                    .select(baseSelect)
                    .from(user)
                    .leftJoin(classes, eq(user.id, classes.teacherId))
                    .where(and(eq(user.role, role), eq(classes.id, classId)))
                    .groupBy(...groupByFields)
                    .orderBy(desc(user.createdAt))
                    .limit(limitPerPage)
                    .offset(offset)
                : await db
                    .select(baseSelect)
                    .from(user)
                    .leftJoin(enrollments, eq(user.id, enrollments.studentId))
                    .where(and(eq(user.role, role), eq(enrollments.classId, classId)))
                    .groupBy(...groupByFields)
                    .orderBy(desc(user.createdAt))
                    .limit(limitPerPage)
                    .offset(offset);

        res.status(200).json({
            data: usersList,
            pagination: {
                page: currentPage,
                limit: limitPerPage,
                total: totalCount,
                totalPages: Math.ceil(totalCount / limitPerPage),
            },
        });
    } catch (error) {
        console.error("GET /classes/:id/users error:", error);
        res.status(500).json({ error: "Failed to fetch class users" });
    }
});

// PUT /classes/:id — update
router.put("/:id", async (req, res) => {
    try {
        const classId = Number(req.params.id);
        if (!Number.isFinite(classId)) {
            return res.status(400).json({ error: "Invalid class id" });
        }

        const currentAuth = (req as any).user as { id: string; role: string } | undefined;
        if (currentAuth) {
            const [targetClass] = await db
                .select({ teacherId: classes.teacherId })
                .from(classes)
                .where(eq(classes.id, classId));
            if (!targetClass) {
                return res.status(404).json({ error: "Class not found" });
            }
            if (currentAuth.role !== "admin" && currentAuth.id !== targetClass.teacherId) {
                return res.status(403).json({ error: "Forbidden: only an admin or the class teacher can update this class" });
            }
        }

        const {
            name,
            teacherId,
            subjectId,
            capacity,
            description,
            status,
            bannerUrl,
            bannerCldPubId,
            schedules,
        } = req.body;

        const updateData: Record<string, any> = {};
        if (name !== undefined) updateData.name = name;
        if (teacherId !== undefined) updateData.teacherId = teacherId;
        if (subjectId !== undefined) updateData.subjectId = subjectId;
        if (capacity !== undefined) updateData.capacity = capacity;
        if (description !== undefined) updateData.description = description;
        if (status !== undefined) updateData.status = status;
        if (bannerUrl !== undefined) updateData.bannerUrl = bannerUrl;
        if (bannerCldPubId !== undefined) updateData.bannerCldPubId = bannerCldPubId;
        if (schedules !== undefined) updateData.schedules = schedules;

        const [updated] = await db
            .update(classes)
            .set(updateData)
            .where(eq(classes.id, classId))
            .returning();

        if (!updated) {
            return res.status(404).json({ error: "Class not found" });
        }

        res.status(200).json({ data: updated });
    } catch (error) {
        console.error("PUT /classes/:id error:", error);
        res.status(500).json({ error: "Failed to update class" });
    }
});

// DELETE /classes/:id — delete class and its enrollments
router.delete("/:id", async (req, res) => {
    try {
        const classId = Number(req.params.id);
        if (!Number.isFinite(classId)) {
            return res.status(400).json({ error: "Invalid class id" });
        }

        const currentAuth = (req as any).user as { id: string; role: string } | undefined;
        if (currentAuth) {
            const [targetClass] = await db
                .select({ teacherId: classes.teacherId })
                .from(classes)
                .where(eq(classes.id, classId));
            if (!targetClass) {
                return res.status(404).json({ error: "Class not found" });
            }
            if (currentAuth.role !== "admin" && currentAuth.id !== targetClass.teacherId) {
                return res.status(403).json({ error: "Forbidden: only an admin or the class teacher can delete this class" });
            }
        }

        // Enrollments cascade on delete, so just delete the class
        const [deleted] = await db
            .delete(classes)
            .where(eq(classes.id, classId))
            .returning({ id: classes.id });

        if (!deleted) {
            return res.status(404).json({ error: "Class not found" });
        }

        res.status(200).json({ data: deleted });
    } catch (error) {
        console.error("DELETE /classes/:id error:", error);
        res.status(500).json({ error: "Failed to delete class" });
    }
});

// POST /classes/join — student self-enrolls via invite code
router.post("/join", async (req, res) => {
    try {
        const { inviteCode } = req.body;

        if (!inviteCode) {
            return res.status(400).json({ error: "inviteCode is required" });
        }

        const studentId = (req as any).user?.id;
        if (!studentId) {
            return res.status(401).json({ error: "Authentication required" });
        }

        const role = (req as any).user?.role;
        if (role !== "student") {
            return res.status(403).json({ error: "Only students can join classes via invite code" });
        }

        // Find class by invite code
        const [classData] = await db
            .select({ id: classes.id, capacity: classes.capacity, name: classes.name })
            .from(classes)
            .where(eq(classes.inviteCode, inviteCode));

        if (!classData) {
            return res.status(404).json({ error: "Invalid invite code — no class found" });
        }

        // Check capacity
        const enrollCount = await db
            .select({ count: sql<number>`cast(count(*) as integer)` })
            .from(enrollments)
            .where(eq(enrollments.classId, classData.id));

        if ((enrollCount[0]?.count ?? 0) >= classData.capacity) {
            return res.status(409).json({ error: "Class is at maximum capacity" });
        }

        // Check duplicate
        const [existing] = await db
            .select({ studentId: enrollments.studentId })
            .from(enrollments)
            .where(and(eq(enrollments.classId, classData.id), eq(enrollments.studentId, studentId)));

        if (existing) {
            return res.status(409).json({ error: "You are already enrolled in this class" });
        }

        await db.insert(enrollments).values({ studentId, classId: classData.id });

        res.status(201).json({ data: { studentId, classId: classData.id, className: classData.name } });
    } catch (error) {
        console.error("POST /classes/join error:", error);
        res.status(500).json({ error: "Failed to join class" });
    }
});

// POST /classes/:id/enroll — enroll a student
router.post("/:id/enroll", async (req, res) => {
    try {
        const classId = Number(req.params.id);
        if (!Number.isFinite(classId)) {
            return res.status(400).json({ error: "Invalid class id" });
        }

        const { studentId } = req.body;
        if (!studentId) {
            return res.status(400).json({ error: "studentId is required" });
        }

        // Check class exists and get capacity + teacherId for auth check
        const [classData] = await db
            .select({ id: classes.id, capacity: classes.capacity, teacherId: classes.teacherId })
            .from(classes)
            .where(eq(classes.id, classId));

        if (!classData) {
            return res.status(404).json({ error: "Class not found" });
        }

        // Authorization: only admin or the class's own teacher may enroll students
        const currentAuth = (req as any).user as { id: string; role: string } | undefined;
        if (!currentAuth || (currentAuth.role !== "admin" && currentAuth.id !== classData.teacherId)) {
            return res.status(403).json({ error: "Forbidden: only an admin or the class teacher can enroll students" });
        }

        // Validate that the target user exists and is a student
        const [targetUser] = await db
            .select({ id: user.id, role: user.role })
            .from(user)
            .where(eq(user.id, studentId));

        if (!targetUser) {
            return res.status(404).json({ error: "User not found" });
        }
        if (targetUser.role !== "student") {
            return res.status(400).json({ error: "Target user is not a student" });
        }

        // Check current enrollment count
        const enrollCount = await db
            .select({ count: sql<number>`cast(count(*) as integer)` })
            .from(enrollments)
            .where(eq(enrollments.classId, classId));

        if ((enrollCount[0]?.count ?? 0) >= classData.capacity) {
            return res.status(409).json({ error: "Class is at maximum capacity" });
        }

        // Check duplicate
        const [existing] = await db
            .select({ studentId: enrollments.studentId })
            .from(enrollments)
            .where(and(eq(enrollments.classId, classId), eq(enrollments.studentId, studentId)));

        if (existing) {
            return res.status(409).json({ error: "Student is already enrolled in this class" });
        }

        await db.insert(enrollments).values({ studentId, classId });

        res.status(201).json({ data: { studentId, classId } });
    } catch (error) {
        console.error("POST /classes/:id/enroll error:", error);
        res.status(500).json({ error: "Failed to enroll student" });
    }
});

// DELETE /classes/:id/unenroll — unenroll a student
router.delete("/:id/unenroll", async (req, res) => {
    try {
        const classId = Number(req.params.id);
        if (!Number.isFinite(classId)) {
            return res.status(400).json({ error: "Invalid class id" });
        }

        const { studentId } = req.body;
        if (!studentId) {
            return res.status(400).json({ error: "studentId is required" });
        }

        const currentAuth = (req as any).user as { id: string; role: string } | undefined;
        if (currentAuth) {
            const [targetClass] = await db
                .select({ teacherId: classes.teacherId })
                .from(classes)
                .where(eq(classes.id, classId));
            if (!targetClass) {
                return res.status(404).json({ error: "Class not found" });
            }
            if (currentAuth.role !== "admin" && currentAuth.id !== targetClass.teacherId) {
                return res.status(403).json({ error: "Forbidden: only an admin or the class teacher can unenroll students" });
            }
        }

        const [deleted] = await db
            .delete(enrollments)
            .where(and(eq(enrollments.classId, classId), eq(enrollments.studentId, studentId)))
            .returning();

        if (!deleted) {
            return res.status(404).json({ error: "Enrollment not found" });
        }

        res.status(200).json({ data: { studentId, classId } });
    } catch (error) {
        console.error("DELETE /classes/:id/unenroll error:", error);
        res.status(500).json({ error: "Failed to unenroll student" });
    }
});

export default router;