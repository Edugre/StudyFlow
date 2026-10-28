import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createCourse,
  deleteCourse,
  findCourse,
  listCourses,
  updateCourseField,
} from '../src/web/features/courses/course-api.js';
import { account, client, email, password, stack } from './support/supabase.js';

test(
  'SYS-01/CM-01: accounts, course creation, reopening and isolation',
  { skip: stack },
  async () => {
    const address = email();
    const student = await account(address);
    const duplicate = await client().auth.signUp({ email: address, password });
    assert(duplicate.error, 'duplicate email is rejected');
    const wrong = await client().auth.signInWithPassword({
      email: address,
      password: 'incorrect-password',
    });
    assert(wrong.error, 'incorrect password is rejected');

    const course = await createCourse(student, { name: '  Engineering  ' });
    assert.equal(course.name, 'Engineering');
    assert.deepEqual(
      (await listCourses(student)).map((item) => item.id),
      [course.id],
    );
    assert.equal((await findCourse(student, course.id))?.name, 'Engineering');
    assert.equal(await findCourse(student, 'not-a-uuid'), null);

    // Owner identity is never accepted from the client.
    const { data: me } = await student.auth.getUser();
    const spoof = await student
      .from('courses')
      .insert({ name: 'Spoofed', owner_id: me.user!.id });
    assert.equal(spoof.error?.code, '42501');

    const other = await account();
    assert.equal(await findCourse(other, course.id), null);
    assert.deepEqual(await listCourses(other), []);
    await assert.rejects(
      updateCourseField(other, course.id, 'code', 'spoofed'),
      /Course not found/,
    );
    assert.equal(await deleteCourse(other, course.id), false);

    const anonymous = client();
    await assert.rejects(listCourses(anonymous));
    await assert.rejects(createCourse(anonymous, { name: 'Anonymous' }));

    await student.auth.signOut();
    await assert.rejects(listCourses(student));
    const again = client();
    const signIn = await again.auth.signInWithPassword({
      email: address,
      password,
    });
    assert.equal(signIn.error, null);
    assert.equal((await findCourse(again, course.id))?.name, 'Engineering');
  },
);
