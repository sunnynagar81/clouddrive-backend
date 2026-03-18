const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const authController = require('../controllers/auth.controller');
const foldersController = require('../controllers/folders.controller');
const filesController = require('../controllers/files.controller');
const sharesController = require('../controllers/shares.controller');
const searchController = require('../controllers/search.controller');

router.post('/auth/register', authController.register);
router.post('/auth/login', authController.login);
router.post('/auth/logout', authController.logout);
router.post('/auth/refresh', authController.refresh);
router.get('/auth/me', auth, authController.me);

router.post('/folders', auth, foldersController.createFolder);
router.get('/folders/:id', auth, foldersController.getFolder);
router.patch('/folders/:id', auth, foldersController.updateFolder);
router.delete('/folders/:id', auth, foldersController.deleteFolder);

router.post('/files/init', auth, filesController.initUpload);
router.post('/files/complete', auth, filesController.completeUpload);
router.get('/files/:id', auth, filesController.getFile);
router.patch('/files/:id', auth, filesController.updateFile);
router.delete('/files/:id', auth, filesController.deleteFile);

router.post('/shares', auth, sharesController.createShare);
router.get('/shares/:resourceType/:resourceId', auth, sharesController.listShares);
router.delete('/shares/:id', auth, sharesController.deleteShare);

router.post('/link-shares', auth, sharesController.createLinkShare);
router.get('/link/:token', sharesController.resolveLinkShare);
router.delete('/link-shares/:id', auth, sharesController.deleteLinkShare);

router.get('/search', auth, searchController.search);
router.get('/recent', auth, searchController.getRecent);
router.get('/stars', auth, searchController.getStars);
router.post('/stars', auth, searchController.addStar);
router.delete('/stars', auth, searchController.removeStar);
router.get('/trash', auth, searchController.getTrash);
router.post('/trash/restore', auth, searchController.restoreFromTrash);

module.exports = router;