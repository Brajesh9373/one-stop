import type { FacultySourceDocument } from '@/lib/rag/types'

import type { FacultyConnector, FacultyConnectorSyncRequest } from '@/lib/connectors/types'

function buildDriveDocuments(input: FacultyConnectorSyncRequest): FacultySourceDocument[] {
  return [
    {
      id: `${input.courseId}-drive-l09-notes-bfs`,
      institutionId: 'onestop-demo',
      facultyId: input.facultyId,
      courseId: input.courseId,
      courseName: 'Data Structures & Algorithms',
      lectureId: `${input.courseId}-lecture-09`,
      lectureTitle: 'Breadth-First Search and Queue Thinking',
      lectureSequence: 9,
      topic: 'Breadth-first search',
      sourceType: 'notes',
      sourceName: 'Google Drive Lecture 09 Notes',
      section: 'BFS intuition',
      page: 3,
      updatedAt: '2026-08-13T10:15:00.000Z',
      content:
        'Breadth-first search explores a graph level by level. A queue preserves the frontier, ensuring nodes discovered earlier are expanded first. BFS is useful for shortest path reasoning in unweighted graphs.',
    },
    {
      id: `${input.courseId}-drive-l09-slides-queue`,
      institutionId: 'onestop-demo',
      facultyId: input.facultyId,
      courseId: input.courseId,
      courseName: 'Data Structures & Algorithms',
      lectureId: `${input.courseId}-lecture-09`,
      lectureTitle: 'Breadth-First Search and Queue Thinking',
      lectureSequence: 9,
      topic: 'Queue discipline',
      sourceType: 'slides',
      sourceName: 'Google Drive Lecture 09 Slides',
      section: 'Queue operations',
      page: 8,
      updatedAt: '2026-08-13T10:18:00.000Z',
      content:
        'The BFS queue enqueues neighbors when they are first discovered. Marking visited nodes early prevents duplicate expansion and keeps the traversal bounded.',
    },
  ]
}

function buildClassroomDocuments(input: FacultyConnectorSyncRequest): FacultySourceDocument[] {
  return [
    {
      id: `${input.courseId}-classroom-l08-review-sheet`,
      institutionId: 'onestop-demo',
      facultyId: input.facultyId,
      courseId: input.courseId,
      courseName: 'Data Structures & Algorithms',
      lectureId: `${input.courseId}-lecture-08`,
      lectureTitle: 'Trees, Graphs & Traversals',
      lectureSequence: 8,
      topic: 'Review sheet',
      sourceType: 'reading',
      sourceName: 'Google Classroom Review Sheet',
      section: 'Exam review prompts',
      page: 1,
      updatedAt: '2026-08-13T11:05:00.000Z',
      content:
        'Students should be able to explain why balance matters, compare complete and balanced trees, and predict the output of inorder traversal in a binary search tree.',
    },
    {
      id: `${input.courseId}-classroom-l08-transcript-office-hours`,
      institutionId: 'onestop-demo',
      facultyId: input.facultyId,
      courseId: input.courseId,
      courseName: 'Data Structures & Algorithms',
      lectureId: `${input.courseId}-lecture-08`,
      lectureTitle: 'Trees, Graphs & Traversals',
      lectureSequence: 8,
      topic: 'Office hours clarifications',
      sourceType: 'transcript',
      sourceName: 'Google Classroom Office Hours Transcript',
      section: 'Why skew hurts performance',
      timestamp: '12:14',
      updatedAt: '2026-08-13T11:12:00.000Z',
      content:
        'A skewed tree behaves more like a linked list because each operation follows a long single path. That is why balance is not cosmetic; it directly affects runtime.',
    },
  ]
}

export const mockGoogleDriveConnector: FacultyConnector = {
  type: 'google-drive',
  async sync(input) {
    return buildDriveDocuments(input)
  },
}

export const mockGoogleClassroomConnector: FacultyConnector = {
  type: 'google-classroom',
  async sync(input) {
    return buildClassroomDocuments(input)
  },
}
