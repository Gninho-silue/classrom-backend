import express from "express";
import { and, desc, eq, getTableColumns, ilike, or, sql } from "drizzle-orm";

import { user, classes, enrollments } from "../db/schema/index.js";
import { db } from "../db/index.js";

const router = express.Router();

// Get all users with optional search, filtering and pagination
router.get("/", async (req, res) => {
    try {
        const { search, role, page = 1, limit = 10 } = req.query;

        const currentPage = Math.max(1, parseInt(String(page), 10) || 1);
        const limitPerPage = Math.min(Math.max(1, parseInt(String(limit), 10) || 10), 100);

        const offset = (currentPage - 1) * limitPerPage;

        const filterConditions = [];

        if (search) {
            filterConditions.push(
                or(
                    ilike(user.name, `%${search}%`),
                    ilike(user.email, `%${search}%`)
                )
            );
        }

        if (role) {
            filterConditions.push(eq(user.role, role as any));
        }

        const whereClause = filterConditions.length > 0 ? and(...filterConditions) : undefined;

        const countResult = await db
            .select({ count: sql<number>`cast(count(*) as integer)` })
            .from(user)
            .where(whereClause);

        const totalCount = countResult[0]?.count ?? 0;

        const usersList = await db
            .select({
                ...getTableColumns(user),
            }).from(user)
            .where(whereClause)
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
            }
        })

    } catch (e) {
        console.error(`GET /users error: ${e}`);
        res.status(500).json({ error: 'Failed to get users' });
    }
});

// GET /users/:id — detail
router.get("/:id", async (req, res) => {
    try {
        const id = req.params.id;

        const [found] = await db
            .select({ ...getTableColumns(user) })
            .from(user)
            .where(eq(user.id, id));

        if (!found) {
            return res.status(404).json({ error: "User not found" });
        }

        res.status(200).json({ data: found });
    } catch (error) {
        console.error("GET /users/:id error:", error);
        res.status(500).json({ error: "Failed to fetch user" });
    }
});

// PUT /users/:id — update
router.put("/:id", async (req, res) => {
    try {
        const id = req.params.id;
        const caller = (req as any).user as { id: string; role: string } | undefined;
        const { name, email, role: newRole, image, imageCldPubId } = req.body;

        const patch: Record<string, any> = {};
        if (name !== undefined) patch.name = name;
        if (email !== undefined) patch.email = email;
        if (image !== undefined) patch.image = image;
        if (imageCldPubId !== undefined) patch.imageCldPubId = imageCldPubId;

        // Only admins may change roles
        if (newRole !== undefined) {
            if (caller?.role !== "admin") {
                return res.status(403).json({ error: "Forbidden: only admins can change user roles" });
            }
            patch.role = newRole;
        }

        const [updated] = await db
            .update(user)
            .set(patch)
            .where(eq(user.id, id))
            .returning();

        if (!updated) {
            return res.status(404).json({ error: "User not found" });
        }

        res.status(200).json({ data: updated });
    } catch (error) {
        console.error("PUT /users/:id error:", error);
        res.status(500).json({ error: "Failed to update user" });
    }
});

// DELETE /users/:id — delete (checks for teaching assignments and enrollments)
router.delete("/:id", async (req, res) => {
    try {
        const id = req.params.id;
        const caller = (req as any).user as { id: string; role: string } | undefined;

        if (caller?.role !== "admin" && caller?.id !== id) {
            return res.status(403).json({ error: "Forbidden: only admins or the user themselves can delete this account" });
        }

        // Check if user teaches any classes
        const teachingCount = await db
            .select({ count: sql<number>`cast(count(*) as integer)` })
            .from(classes)
            .where(eq(classes.teacherId, id));

        if ((teachingCount[0]?.count ?? 0) > 0) {
            return res.status(409).json({
                error: "Cannot delete user who is assigned as a teacher. Reassign their classes first.",
            });
        }

        // Remove enrollments first (cascade should handle it, but be explicit)
        await db.delete(enrollments).where(eq(enrollments.studentId, id));

        const [deleted] = await db
            .delete(user)
            .where(eq(user.id, id))
            .returning({ id: user.id });

        if (!deleted) {
            return res.status(404).json({ error: "User not found" });
        }

        res.status(200).json({ data: deleted });
    } catch (error) {
        console.error("DELETE /users/:id error:", error);
        res.status(500).json({ error: "Failed to delete user" });
    }
});

export default router;