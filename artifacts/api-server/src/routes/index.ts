import { Router, type IRouter } from "express";
import healthRouter from "./health";
import ipRouter from "./ip";

const router: IRouter = Router();

router.use(healthRouter);
router.use(ipRouter);

export default router;
