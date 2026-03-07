import express from "express";
import { and, desc, eq, getTableColumns, ilike, or, sql } from "drizzle-orm";

import { db } from "../db/index.js";
import { departments, subjects } from "../db/schema/index.js";

const router = express.Router();

// GET /departments — list with optional search and pagination
router.get("/", async (req, res) => {
    try {
        const { search, page = 1, limit = 10 } = req.query;

        const parsedPage = parseInt(page as string, 10);
        const parsedLimit = parseInt(limit as string, 10);
        const currentPage = Math.max(1, Number.isNaN(parsedPage) ? 1 : parsedPage);
        const limitPerPage = Math.max(1, Number.isNaN(parsedLimit) ? 10 : parsedLimit);
        const offset = (currentPage - 1) * limitPerPage;

        const filterConditions = [];

        if (search) {
            filterConditions.push(
                or(
                    ilike(departments.name, `%${search}%`),
                    ilike(departments.code, `%${search}%`)
                )
            );
        }

        const whereClause =
            filterConditions.length > 0 ? and(...filterConditions) : undefined;

        const countResult = await db
            .select({ count: sql<number>`cast(count(*) as integer)` })
            .from(departments)
            .where(whereClause);

        const totalCount = countResult[0]?.count ?? 0;

        const departmentsList = await db
            .select({ ...getTableColumns(departments) })
            .from(departments)
            .where(whereClause)
            .orderBy(desc(departments.createdAt))
            .limit(limitPerPage)
            .offset(offset);

        res.status(200).json({
            data: departmentsList,
            pagination: {
                page: currentPage,
                limit: limitPerPage,
                total: totalCount,
                totalPages: Math.ceil(totalCount / limitPerPage),
            },
        });
    } catch (error) {
        console.error("GET /departments error:", error);
        res.status(500).json({ error: "Failed to fetch departments" });
    }
});

// POST /departments — create
router.post("/", async (req, res) => {
    try {
        const { name, code, description } = req.body;

        if (!name?.trim() || !code?.trim()) {
            return res.status(400).json({ error: "name and code are required" });
        }

        const [existing] = await db
            .select({ id: departments.id })
            .from(departments)
            .where(eq(departments.code, code.trim()));

        if (existing) {
            return res.status(400).json({ error: "department code already exists" });
        }

        const [created] = await db
            .insert(departments)
            .values({ name: name.trim(), code: code.trim(), description })
            .returning();

        res.status(201).json({ data: created });
    } catch (error) {
        console.error("POST /departments error:", error);
        res.status(500).json({ error: "Failed to create department" });
    }
});

// GET /departments/:id — detail
router.get("/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) {
            return res.status(400).json({ error: "Invalid department id" });
        }

        const [dept] = await db
            .select({ ...getTableColumns(departments) })
            .from(departments)
            .where(eq(departments.id, id));

        if (!dept) {
            return res.status(404).json({ error: "Department not found" });
        }

        res.status(200).json({ data: dept });
    } catch (error) {
        console.error("GET /departments/:id error:", error);
        res.status(500).json({ error: "Failed to fetch department" });
    }
});

// PUT /departments/:id — update
router.put("/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) {
            return res.status(400).json({ error: "Invalid department id" });
        }

        const { name, code, description } = req.body;

        const patch: Record<string, any> = {};
        if (name !== undefined) patch.name = name;
        if (code !== undefined) patch.code = code;
        if (description !== undefined) patch.description = description;

        const [updated] = await db
            .update(departments)
            .set(patch)
            .where(eq(departments.id, id))
            .returning();

        if (!updated) {
            return res.status(404).json({ error: "Department not found" });
        }

        res.status(200).json({ data: updated });
    } catch (error) {
        console.error("PUT /departments/:id error:", error);
        res.status(500).json({ error: "Failed to update department" });
    }
});

// DELETE /departments/:id — delete (will fail if subjects reference it)
router.delete("/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) {
            return res.status(400).json({ error: "Invalid department id" });
        }

        // Check for child subjects
        const childSubjects = await db
            .select({ count: sql<number>`cast(count(*) as integer)` })
            .from(subjects)
            .where(eq(subjects.departmentId, id));

        if ((childSubjects[0]?.count ?? 0) > 0) {
            return res.status(409).json({
                error: "Cannot delete department with existing subjects. Remove all subjects first.",
            });
        }

        const [deleted] = await db
            .delete(departments)
            .where(eq(departments.id, id))
            .returning({ id: departments.id });

        if (!deleted) {
            return res.status(404).json({ error: "Department not found" });
        }

        res.status(200).json({ data: deleted });
    } catch (error) {
        console.error("DELETE /departments/:id error:", error);
        res.status(500).json({ error: "Failed to delete department" });
    }
});

export default router;
