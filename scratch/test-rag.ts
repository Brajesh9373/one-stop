import { runHybridLectureRag } from '../lib/rag/hybrid'
import { getRagRepository } from '../lib/rag/repository'

async function main() {
  try {
    const res = await runHybridLectureRag({
      mode: 'chat',
      studentId: 'student-brajesh',
      prompt: 'hello',
      context: {
        institutionId: 'inst-brajesh',
        facultyId: 'faculty-brajesh',
        courseId: 'cs301',
        courseName: 'CS 301',
        lectureId: 'l08',
        lectureTitle: 'Lecture 8',
        lectureSequence: 8,
      }
    })
    console.log(res)
  } catch (err) {
    console.error(err)
  }
}
main()
