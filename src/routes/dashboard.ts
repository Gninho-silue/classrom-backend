import express from "express";
import { eq, sql, desc, count } from "drizzle-orm";

import { db } from "../db/index.js";
import { classes, departments, enrollments, subjects, user } from "../db/schema/index.js";

const router = express.Router();

// GET /dashboard/stats — aggregated stats for the dashboard
router.get("/stats", async (req, res) => {
    try {
        // 1. Overview counts
        const [userCount] = await db.select({ count: sql<number>`cast(count(*) as integer)` }).from(user);
        const [classCount] = await db.select({ count: sql<number>`cast(count(*) as integer)` }).from(classes);
        const [subjectCount] = await db.select({ count: sql<number>`cast(count(*) as integer)` }).from(subjects);
        const [departmentCount] = await db.select({ count: sql<number>`cast(count(*) as integer)` }).from(departments);
        const [enrollmentCount] = await db.select({ count: sql<number>`cast(count(*) as integer)` }).from(enrollments);

        // 2. User distribution by role
        const userDistribution = await db
            .select({
                role: user.role,
                count: sql<number>`cast(count(*) as integer)`,
            })
            .from(user)
            .groupBy(user.role);

        // 3. Classes by department
        const classesByDept = await db
            .select({
                department: departments.name,
                count: sql<number>`cast(count(*) as integer)`,
            })
            .from(classes)
            .leftJoin(subjects, eq(classes.subjectId, subjects.id))
            .leftJoin(departments, eq(subjects.departmentId, departments.id))
            .groupBy(departments.name);

        // 4. Class capacity status (how full classes are)
        const capacityStatus = await db
            .select({
                classId: classes.id,
                className: classes.name,
                capacity: classes.capacity,
                enrolled: sql<number>`cast(coalesce(count(${enrollments.studentId}), 0) as integer)`,
            })
            .from(classes)
            .leftJoin(enrollments, eq(classes.id, enrollments.classId))
            .groupBy(classes.id, classes.name, classes.capacity)
            .orderBy(desc(classes.createdAt))
            .limit(20);

        // 5. Enrollment trends — enrollments per class (top 10 most enrolled)
        const enrollmentTrends = await db
            .select({
                className: classes.name,
                enrollments: sql<number>`cast(count(${enrollments.studentId}) as integer)`,
            })
            .from(enrollments)
            .leftJoin(classes, eq(enrollments.classId, classes.id))
            .groupBy(classes.name)
            .orderBy(desc(sql`cast(count(${enrollments.studentId}) as integer)`))
            .limit(10);

        // 6. Recent activity — latest enrolled users
        const recentEnrollments = await db
            .select({
                studentName: user.name,
                studentEmail: user.email,
                studentImage: user.image,
                className: classes.name,
            })
            .from(enrollments)
            .leftJoin(user, eq(enrollments.studentId, user.id))
            .leftJoin(classes, eq(enrollments.classId, classes.id))
            .orderBy(desc(user.createdAt))
            .limit(10);

        // 7. Recent classes
        const recentClasses = await db
            .select({
                id: classes.id,
                name: classes.name,
                status: classes.status,
                capacity: classes.capacity,
                createdAt: classes.createdAt,
                teacherName: user.name,
                subjectName: subjects.name,
            })
            .from(classes)
            .leftJoin(user, eq(classes.teacherId, user.id))
            .leftJoin(subjects, eq(classes.subjectId, subjects.id))
            .orderBy(desc(classes.createdAt))
            .limit(5);

        res.status(200).json({
            data: {
                overview: {
                    totalUsers: userCount?.count ?? 0,
                    totalClasses: classCount?.count ?? 0,
                    totalSubjects: subjectCount?.count ?? 0,
                    totalDepartments: departmentCount?.count ?? 0,
                    totalEnrollments: enrollmentCount?.count ?? 0,
                },
                userDistribution,
                classesByDept,
                capacityStatus,
                enrollmentTrends,
                recentEnrollments,
                recentClasses,
            },
        });
    } catch (error) {
        console.error("GET /dashboard/stats error:", error);
        res.status(500).json({ error: "Failed to fetch dashboard stats" });
    }
});

export default router;
